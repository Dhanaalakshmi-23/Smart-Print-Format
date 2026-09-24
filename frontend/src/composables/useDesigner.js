// All components share one designer instance, so the canvas, the field
// picker and the toolbar see the same history and selection.

import { computed, effectScope } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useHistory } from '@/composables/useHistory'
import {
  cloneLayout,
  createColumn,
  createComponentNode,
  createField,
  createSection,
  findNode,
  findParent,
  insertNode,
  removeNode,
} from '@/utils/layout'

function createDesigner() {
  const store = useSmartPrintStore()
  const history = useHistory()

  const layoutState = computed(() => store.layoutJson)
  const selectedNode = computed(() => store.selectedNodeData)

  // Start a clean history whenever a different document is opened.
  history.reset(store.layoutJson)
  store.$onAction(({ name, after }) => {
    if (name === 'load' || name === 'newSPF') {
      after(() => history.reset(store.layoutJson))
    }
  }, true) // `true`: keep listening even after the calling component unmounts

  // Run `mutate` on a copy of the layout, then store it and record it.
  // Working on a copy means a failing operation leaves the layout untouched.
  function commit(mutate) {
    const draft = cloneLayout(store.layoutJson)
    const result = mutate(draft)
    store.setLayout(draft)
    history.push(draft)
    return result
  }

  // ---- Layout operations ----

  // Returns the new section's id.
  function addSection({ label = '', columns = 1, index } = {}) {
    return commit((layout) => insertNode(layout, createSection({ label, columns }), index).id)
  }

  // Returns the new column's id.
  function addColumn(sectionId, { index } = {}) {
    return commit((layout) => {
      const section = findNode(layout, sectionId)
      if (!section) throw new Error(`Section '${sectionId}' not found.`)
      return insertNode(section, createColumn(), index).id
    })
  }

  // `node` is a DocType field (e.g. from useDoctypeMeta().fields).
  // Without a columnId the field goes into the selected column, the column of
  // the selected field, or the last column, creating a section if needed.
  // Returns the new field's id.
  function addField(node, { columnId, index } = {}) {
    return addToColumn(createField(node), { columnId, index })
  }

  // `component` is a Smart Print Format Component (from ComponentPalette).
  // Placement works like addField. Returns the new node's id.
  function addComponent(component, { columnId, index } = {}) {
    return addToColumn(createComponentNode(component), { columnId, index })
  }

  function addToColumn(newNode, { columnId, index }) {
    return commit((layout) => {
      const column = columnId ? findNode(layout, columnId) : defaultColumn(layout)
      if (!column) throw new Error(`Column '${columnId}' not found.`)
      return insertNode(column, newNode, index).id
    })
  }

  // Move a node to `targetId` (a section/column id, or null for the layout
  // root when moving sections) at `index`. The index counts positions after
  // the node has been taken out, which is what drag-and-drop libraries report.
  function moveNode(id, targetId, index) {
    commit((layout) => {
      const target = targetId ? findNode(layout, targetId) : layout
      if (!target) throw new Error(`Target '${targetId}' not found.`)
      if (findNode(findNode(layout, id), targetId)) {
        throw new Error('A node cannot be moved inside itself.')
      }
      const node = removeNode(layout, id)
      if (!node) throw new Error(`Node '${id}' not found.`)
      insertNode(target, node, index)
    })
  }

  // Move a node one position up/left (-1) or down/right (+1) among its siblings.
  function moveNodeBy(id, delta) {
    const location = findParent(store.layoutJson, id)
    if (!location) return
    const index = location.index + delta
    if (index < 0 || index >= location.list.length) return
    moveNode(id, location.parent.id ?? null, index)
  }

  function deleteNode(id) {
    commit((layout) => {
      if (!removeNode(layout, id)) throw new Error(`Node '${id}' not found.`)
    })
    // store.setLayout already clears the selection if the selected node
    // (or its parent) was removed.
  }

  // Merge `props` into the node's props (styling, visibility, ...).
  function updateProps(id, props) {
    commit((layout) => {
      const node = findNode(layout, id)
      if (!node) throw new Error(`Node '${id}' not found.`)
      node.props = { ...node.props, ...props }
    })
  }

  // ---- Selection ----

  function selectNode(id) {
    store.selectNode(id)
  }

  function defaultColumn(layout) {
    const selectedId = store.selectedNode
    const selected = findNode(layout, selectedId)
    if (selected?.type === 'column') return selected
    if (selected?.type === 'field' || selected?.type === 'component') return findParent(layout, selectedId).parent

    let section = layout.sections.at(-1)
    if (!section) section = insertNode(layout, createSection())
    return section.columns.at(-1) || insertNode(section, createColumn())
  }

  // ---- Undo / redo ----

  function undo() {
    const snapshot = history.undo()
    if (snapshot) store.setLayout(snapshot)
  }

  function redo() {
    const snapshot = history.redo()
    if (snapshot) store.setLayout(snapshot)
  }

  return {
    layoutState,
    selectedNode,
    selectNode,
    addSection,
    addColumn,
    addField,
    addComponent,
    moveNode,
    moveNodeBy,
    deleteNode,
    updateProps,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }
}

// One shared instance. It runs in a detached effect scope so its computed
// values keep working even after the component that first called it unmounts.
let designer = null

export function useDesigner() {
  if (!designer) {
    designer = effectScope(true).run(createDesigner)
  }
  return designer
}
