// The drag-and-drop contract between the palettes and the canvas.
//
// Palettes call setDragData() in their `dragstart` handler; the canvas calls
// getDragData() in its `drop` handler. Payloads look like:
//
//   { kind: 'field',     field:     { fieldname, label, fieldtype, options } }
//   { kind: 'component', component: { name, component_name, component_type, configuration_json } }
//   { kind: 'move',      id, nodeType }       (dragging an existing canvas node)

import { PARENT_TYPE } from './layout'

// A custom type, so the canvas can ignore unrelated drags (files, text, ...).
export const DRAG_MIME = 'application/x-smart-print-node'

// Browsers hide drag data until `drop`, but expose the list of types during
// `dragover`. So each drag also carries a marker type naming where it
// may land ('layout', 'section' or 'column'), letting drop targets decide
// whether to accept it while it's still hovering.
const landingMime = (parentType) => `${DRAG_MIME}-into-${parentType}`

// New fields and components always land in a column; moved nodes land
// wherever their type lives.
const landingOf = (payload) => (payload.kind === 'move' ? PARENT_TYPE[payload.nodeType] : 'column')

export function setDragData(event, payload) {
  event.dataTransfer.effectAllowed = payload.kind === 'move' ? 'move' : 'copy'
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.setData(landingMime(landingOf(payload)), '1')
  // Plain-text fallback, useful when dropping into a text editor.
  event.dataTransfer.setData('text/plain', payload.field?.fieldname || payload.component?.name || payload.id || '')
}

// During `dragover` the data can't be read yet (browser security),
// but the types list can: use this to decide whether to allow the drop.
export function hasDragData(event) {
  return Array.from(event.dataTransfer?.types || []).includes(DRAG_MIME)
}

// True while hovering if the dragged item may be dropped into `parentType`.
export function acceptsDrop(event, parentType) {
  return Array.from(event.dataTransfer?.types || []).includes(landingMime(parentType))
}

// Returns the payload, or null for drags that didn't come from a palette.
export function getDragData(event) {
  const raw = event.dataTransfer?.getData(DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
