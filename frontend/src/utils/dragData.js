import { PARENT_TYPE } from './layout'

export const DRAG_MIME = 'application/x-smart-print-node'

const landingMime = (parentType) => `${DRAG_MIME}-into-${parentType}`

const landingOf = (payload) => (payload.kind === 'move' ? PARENT_TYPE[payload.nodeType] : 'column')

export function setDragData(event, payload) {
  event.dataTransfer.effectAllowed = payload.kind === 'move' ? 'move' : 'copy'
  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
  event.dataTransfer.setData(landingMime(landingOf(payload)), '1')

  event.dataTransfer.setData('text/plain', payload.field?.fieldname || payload.component?.name || payload.id || '')
}

export function hasDragData(event) {
  return Array.from(event.dataTransfer?.types || []).includes(DRAG_MIME)
}

export function acceptsDrop(event, parentType) {
  return Array.from(event.dataTransfer?.types || []).includes(landingMime(parentType))
}

export function getDragData(event) {
  const raw = event.dataTransfer?.getData(DRAG_MIME)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
