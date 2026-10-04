import { onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useToast } from '@/composables/useToast'
import { acceptsDrop, getDragData } from '@/utils/dragData'
import { findParent } from '@/utils/layout'

export function useDropList(listEl, { parentType, parentId = null, axis = 'y', indexOffset = 0 }) {
  const store = useSmartPrintStore()
  const designer = useDesigner()
  const toast = useToast()
  const dropIndex = ref(null)

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
    if (!acceptsDrop(event, parentType)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
    dropIndex.value = indexFromEvent(event)
  }

  function onDragleave(event) {
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
      toast.error(`Drop rejected: ${err.message}`)
    }
  }

  function applyDrop(payload, index) {
    const targetId = toValue(parentId)
    index += toValue(indexOffset)

    if (payload.kind === 'field') return designer.addField(payload.field, { columnId: targetId, index })
    if (payload.kind === 'component') {
      return designer.addComponent(payload.component, { columnId: targetId, index })
    }
    if (payload.kind === 'move') {
      const location = findParent(store.layoutJson, payload.id)
      const sameList = location && (location.parent.id ?? null) === targetId
      // Moving down in the same list lands one slot earlier once the node is taken out.
      const target = sameList && location.index < index ? index - 1 : index
      if (sameList && target === location.index) return
      designer.moveNode(payload.id, targetId, target)
    }
  }

  const reset = () => (dropIndex.value = null)
  onMounted(() => window.addEventListener('dragend', reset))
  onBeforeUnmount(() => window.removeEventListener('dragend', reset))

  return { dropIndex, onDragover, onDragleave, onDrop }
}
