import { computed, effectScope, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useHistory } from '@/composables/useHistory'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { useToast } from '@/composables/useToast'
import { validateLayoutOnServer } from '@/api/smartPrintApi'
import { locateNode, validateLayout } from '@/utils/validation'
import {
  bodyRange,
  cloneLayout,
  createColumn,
  createComponentNode,
  createField,
  createSection,
  findNode,
  findParent,
  findSectionByKind,
  insertNode,
  removeNode,
} from '@/utils/layout'

function createDesigner() {
  const store = useSmartPrintStore()
  const history = useHistory()

  const layoutState = computed(() => store.layoutJson)
  const selectedNode = computed(() => store.selectedNodeData)

  history.reset(store.layoutJson)
  store.$onAction(({ name, after }) => {
    if (name === 'load' || name === 'newSPF') {
      after(() => history.reset(store.layoutJson))
    }
  }, true)

  // Edits run on a copy, so a failing operation leaves the layout untouched.
  function commit(mutate) {
    const draft = cloneLayout(store.layoutJson)
    const result = mutate(draft)
    store.setLayout(draft)
    history.push(draft)
    return result
  }

  function addSection({ label = '', columns = 1, index, kind } = {}) {
    if (kind && findSectionByKind(store.layoutJson, kind)) {
      return findSectionByKind(store.layoutJson, kind).id
    }
    return commit((layout) => placeSection(layout, createSection({ label, columns, kind }), index).id)
  }

  function placeSection(layout, section, index) {
    if (section.kind === 'header') return insertNode(layout, section, 0)
    if (section.kind === 'footer') return insertNode(layout, section)
    const { start, end } = bodyRange(layout)
    const at = index == null ? end : Math.min(start + Math.max(index, 0), end)
    return insertNode(layout, section, at)
  }

  function addColumn(sectionId, { index } = {}) {
    return commit((layout) => {
      const section = findNode(layout, sectionId)
      if (!section) throw new Error(`Section '${sectionId}' not found.`)
      return insertNode(section, createColumn(), index).id
    })
  }

  function addField(node, placement = {}) {
    return addToColumn(createField(node), placement)
  }

  function addComponent(component, placement = {}) {
    return addToColumn(createComponentNode(component), placement)
  }

  function addToColumn(newNode, { columnId, index, newSection } = {}) {
    return commit((layout) => {
      let column
      if (columnId) {
        column = findNode(layout, columnId)
      } else if (newSection) {
        const section =
          (newSection.kind && findSectionByKind(layout, newSection.kind)) ||
          placeSection(layout, createSection({ kind: newSection.kind }), newSection.index)
        column = section.columns[0]
      } else {
        column = defaultColumn(layout)
      }
      if (!column) throw new Error(`Column '${columnId}' not found.`)
      return insertNode(column, newNode, index).id
    })
  }

  // `index` counts positions after the node is taken out (as drag-and-drop reports it).
  function moveNode(id, targetId, index) {
    commit((layout) => {
      const target = targetId ? findNode(layout, targetId) : layout
      if (!target) throw new Error(`Target '${targetId}' not found.`)
      if (findNode(findNode(layout, id), targetId)) {
        throw new Error('A node cannot be moved inside itself.')
      }
      if (findNode(layout, id)?.kind) throw new Error('The header and footer cannot be moved.')
      const node = removeNode(layout, id)
      if (!node) throw new Error(`Node '${id}' not found.`)
      if (node.type === 'section') {
        const { start, end } = bodyRange(layout)
        index = Math.min(Math.max(index ?? end, start), end)
      }
      insertNode(target, node, index)
    })
  }

  function moveNodeBy(id, delta) {
    const location = findParent(store.layoutJson, id)
    const node = location?.list[location.index]
    if (!node || node.kind) return
    const index = location.index + delta
    const [min, max] =
      node.type === 'section'
        ? ((r) => [r.start, r.end - 1])(bodyRange(store.layoutJson))
        : [0, location.list.length - 1]
    if (index < min || index > max) return
    moveNode(id, location.parent.id ?? null, index)
  }

  function replaceLayout(layout) {
    const next = cloneLayout(layout)
    store.setLayout(next)
    history.push(next)
  }

  function deleteNode(id) {
    commit((layout) => {
      if (!removeNode(layout, id)) throw new Error(`Node '${id}' not found.`)
    })
  }

  function updateProps(id, props) {
    commit((layout) => {
      const node = findNode(layout, id)
      if (!node) throw new Error(`Node '${id}' not found.`)
      node.props = { ...node.props, ...props }
    })
  }

  function selectNode(id) {
    store.selectNode(id)
  }

  function defaultColumn(layout) {
    const selectedId = store.selectedNode
    const selected = findNode(layout, selectedId)
    if (selected?.type === 'column') return selected
    if (selected?.type === 'field' || selected?.type === 'component') return findParent(layout, selectedId).parent

    const { start, end } = bodyRange(layout)
    const section = end > start ? layout.sections[end - 1] : placeSection(layout, createSection())
    return section.columns.at(-1) || insertNode(section, createColumn())
  }

  const toast = useToast()
  const { meta, getChildMeta } = useDoctypeMeta(() => store.targetDoctype)

  const validation = ref(null)
  const validating = ref(false)

  const invalidIds = computed(
    () => new Set((validation.value?.errors || []).map((issue) => issue.nodeId).filter(Boolean)),
  )

  watch(
    () => store.layoutJson,
    () => (validation.value = null),
  )

  const fromServer = (layout) => (issue) => ({
    level: issue.severity === 'warning' ? 'warning' : 'error',
    nodeId: issue.node_id || null,
    location: locateNode(layout, issue.node_id) || 'Layout',
    message: issue.message,
  })

  async function validate() {
    const layout = store.layoutJson
    const local = validateLayout(layout, { meta: meta.value, getChildMeta })

    if (!store.targetDoctype) {
      const result = {
        ...local,
        valid: false,
        errors: [
          { level: 'error', nodeId: null, location: 'Layout', message: 'Select a DocType first.' },
          ...local.errors,
        ],
        source: 'local',
      }
      validation.value = result
      return result
    }

    validating.value = true
    try {
      const response = await validateLayoutOnServer({
        name: store.currentSPF?.name,
        layout,
        targetDoctype: store.targetDoctype,
      })
      const map = fromServer(layout)
      const result = {
        valid: Boolean(response.valid),
        errors: (response.errors || []).map(map),
        warnings: (response.warnings || []).map(map),
        source: 'server',
      }

      if (store.layoutJson === layout) validation.value = result
      return result
    } catch (err) {
      const result = {
        ...local,
        valid: false,
        errors: [
          {
            level: 'error',
            nodeId: null,
            location: 'Server',
            message: `Could not validate on the server: ${err.message}`,
          },
          ...local.errors,
        ],
        source: 'local',
      }
      validation.value = result
      return result
    } finally {
      validating.value = false
    }
  }

  const isWorking = computed(() => validating.value || store.isBusy)

  async function save() {
    if (isWorking.value) return false
    const result = await validate()
    if (!result.valid) return false
    await store.save()
    if (store.status === 'error') {
      toast.error(`Could not save: ${store.error}`)
      return false
    }
    validation.value = null
    const version = store.currentSPF?.version
    toast.success(version ? `Saved · version ${version}` : 'Saved')
    return true
  }

  const publishDialogOpen = ref(false)
  const openPublish = () => (publishDialogOpen.value = true)

  async function publish(changeSummary = '') {
    if (isWorking.value) return { ok: false, error: 'Busy, try again in a moment.' }
    const result = await validate()
    if (!result.valid) return { ok: false, validation: result }
    await store.publish({ changeSummary })
    if (store.status === 'error') return { ok: false, error: store.error }
    validation.value = null
    return { ok: true }
  }

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
    replaceLayout,
    updateProps,
    undo,
    redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    validation,
    validating,
    invalidIds,
    isWorking,
    validate,
    save,
    publish,
    publishDialogOpen,
    openPublish,
  }
}

// One shared instance for all components, in a detached scope so it outlives them.
let designer = null

export function useDesigner() {
  if (!designer) {
    designer = effectScope(true).run(createDesigner)
  }
  return designer
}
