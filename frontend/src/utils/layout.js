// Which array holds a node's children. The layout root has no `type`.
const CHILD_KEY = {
  layout: 'sections',
  section: 'columns',
  column: 'fields',
}

// Which parent type each node type may live in.
export const PARENT_TYPE = {
  section: 'layout',
  column: 'section',
  field: 'column',
  component: 'column', // reusable component, placed alongside fields
}

const typeOf = (node) => node.type || 'layout'

// Read-only: never creates the array, so it's safe inside getters/computed.
export function childrenOf(node) {
  const key = CHILD_KEY[typeOf(node)]
  return (key && node[key]) || []
}

// crypto.randomUUID only exists on https/localhost, and Frappe sites are
// often served over plain http, so build a short random id ourselves.
export function generateId(type) {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${type}_${time}${random}`
}

export const cloneLayout = (layout) => JSON.parse(JSON.stringify(layout))

// ---- Node factories ----

export function createField(docfield = {}) {
  return {
    id: generateId('field'),
    type: 'field',
    fieldname: docfield.fieldname || '',
    label: docfield.label || '',
    fieldtype: docfield.fieldtype || '',
    options: docfield.options || '',
    props: {},
  }
}

// `component` is a Smart Print Format Component (from ComponentPalette).
export function createComponentNode(component = {}) {
  return {
    id: generateId('component'),
    type: 'component',
    component: component.name || '',
    component_name: component.component_name || component.name || '',
    component_type: component.component_type || '',
    configuration: component.configuration_json || {},
    props: {},
  }
}

export function createColumn() {
  return { id: generateId('column'), type: 'column', props: {}, fields: [] }
}

export function createSection({ label = '', columns = 1 } = {}) {
  return {
    id: generateId('section'),
    type: 'section',
    label,
    props: {},
    columns: Array.from({ length: Math.max(1, columns) }, createColumn),
  }
}

// ---- Tree lookups ----

export function findNode(root, id) {
  if (!root || id == null) return null
  if (root.id === id) return root
  for (const child of childrenOf(root)) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

// The node's parent and its position there, or null if not found.
export function findParent(root, id) {
  const list = childrenOf(root)
  const index = list.findIndex((child) => child.id === id)
  if (index !== -1) return { parent: root, list, index }

  for (const child of list) {
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

// ---- Tree mutations (modify `root` in place) ----

export function removeNode(root, id) {
  const location = findParent(root, id)
  if (!location) return null
  const [node] = location.list.splice(location.index, 1)
  return node
}

// Insert `node` into `parent` at `index` (end of list when omitted).
// Throws if the node type can't live in that parent (e.g. a field in a section).
export function insertNode(parent, node, index) {
  if (PARENT_TYPE[node.type] !== typeOf(parent)) {
    throw new Error(`A ${node.type} cannot be placed inside a ${typeOf(parent)}.`)
  }
  const key = CHILD_KEY[typeOf(parent)]
  const list = parent[key] || (parent[key] = [])
  const at = index == null ? list.length : Math.min(Math.max(index, 0), list.length)
  list.splice(at, 0, node)
  return node
}
