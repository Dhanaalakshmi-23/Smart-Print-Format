// Behaviour shared by every block on the canvas: selection, dragging to
// move, and the node actions (move, delete, update props).
//
//   const { isSelected, select, onDragStart, moveBy, remove, updateProps } =
//     useCanvasNode(() => props.node)

import { computed, toValue } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { setDragData } from '@/utils/dragData'

export function useCanvasNode(node) {
  const store = useSmartPrintStore()
  const designer = useDesigner()
  const id = () => toValue(node).id

  const isSelected = computed(() => store.selectedNode === id())

  function select() {
    designer.selectNode(id())
  }

  function onDragStart(event) {
    // Blocks are nested (field inside column inside section): only the
    // innermost dragged block should start the drag.
    event.stopPropagation()
    setDragData(event, { kind: 'move', id: id(), nodeType: toValue(node).type })
  }

  return {
    isSelected,
    select,
    onDragStart,
    moveBy: (delta) => designer.moveNodeBy(id(), delta),
    remove: () => designer.deleteNode(id()),
    updateProps: (props) => designer.updateProps(id(), props),
  }
}
