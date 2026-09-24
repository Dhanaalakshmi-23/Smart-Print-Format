// Makes a list element on the canvas (the sections of the page, the columns
// of a section, or the fields of a column) accept drops.
//
//   const listEl = ref(null)
//   const { dropIndex, onDragover, onDragleave, onDrop } =
//     useDropList(listEl, { parentType: 'column', parentId: () => props.node.id })
//
// - parentType: which drags this list accepts ('layout', 'section', 'column')
// - parentId:   id of the node owning the list (null for the page itself)
// - axis:       'y' for vertical lists, 'x' for side-by-side columns
//
// dropIndex is where the item would land (for drawing the drop indicator).
// Children of the list must carry `data-node-id` to be counted.

import { onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { acceptsDrop, getDragData } from '@/utils/dragData'
import { findParent } from '@/utils/layout'

export function useDropList(listEl, { parentType, parentId = null, axis = 'y' }) {
  const store = useSmartPrintStore()
  const designer = useDesigner()
  const dropIndex = ref(null)

  // Count the children whose midpoint is before the pointer.
  function indexFromEvent(event) {
    const pointer = axis === 'y' ? event.clientY : event.clientX
    let index = 0
    for (const el of listEl.value?.children || []) {
      if (!el.dataset.nodeId) continue
      const rect = el.getBoundingClientRect()
      const middle = axis === 'y' ? rect.top + rect.height / 2 : rect.left + rect.width / 2
      if (pointer > middle) index++
    }
    return index
  }

  function onDragover(event) {
    // Not ours: let the event bubble to an outer list that may accept it.
    if (!acceptsDrop(event, parentType)) return
    event.preventDefault() // required to allow dropping
    event.stopPropagation()
    event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
    dropIndex.value = indexFromEvent(event)
  }

  function onDragleave(event) {
    // dragleave also fires when moving onto a child element; ignore that.
    if (!event.currentTarget.contains(event.relatedTarget)) dropIndex.value = null
  }

  function onDrop(event) {
    if (!acceptsDrop(event, parentType)) return
    event.preventDefault()
    event.stopPropagation()
    const index = dropIndex.value ?? indexFromEvent(event)
    dropIndex.value = null

    const payload = getDragData(event)
    if (!payload) return
    try {
      applyDrop(payload, index)
    } catch (err) {
      console.warn('Drop rejected:', err.message)
    }
  }

  function applyDrop(payload, index) {
    const targetId = toValue(parentId)

    if (payload.kind === 'field') return designer.addField(payload.field, { columnId: targetId, index })
    if (payload.kind === 'component') {
      return designer.addComponent(payload.component, { columnId: targetId, index })
    }
    if (payload.kind === 'move') {
      // moveNode counts the index after the node is taken out, so moving
      // down within the same list lands one position earlier.
      const location = findParent(store.layoutJson, payload.id)
      const sameList = location && (location.parent.id ?? null) === targetId
      const target = sameList && location.index < index ? index - 1 : index
      if (sameList && target === location.index) return
      designer.moveNode(payload.id, targetId, target)
    }
  }

  // A drag cancelled with Esc or dropped elsewhere never reaches our
  // dragleave/drop handlers, so also reset when any drag ends.
  const reset = () => (dropIndex.value = null)
  onMounted(() => window.addEventListener('dragend', reset))
  onBeforeUnmount(() => window.removeEventListener('dragend', reset))

  return { dropIndex, onDragover, onDragleave, onDrop }
}
