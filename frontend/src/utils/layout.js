const CHILD_KEY = {
  layout: 'sections',
  section: 'columns',
  column: 'fields',
}

export const PARENT_TYPE = {
  section: 'layout',
  column: 'section',
  field: 'column',
  component: 'column',
}

const typeOf = (node) => node.type || 'layout'

export function childrenOf(node) {
  const key = CHILD_KEY[typeOf(node)]
  return (key && node[key]) || []
}

export function generateId(type) {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return `${type}_${time}${random}`
}

// Same rule as layout_schema.json: hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or a CSS color name.
export const isValidColor = (value) =>
  typeof value === 'string' && /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]{3,20})$/i.test(value)

export const cloneLayout = (layout) => JSON.parse(JSON.stringify(layout))

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

export function createSection({ label = '', columns = 1, kind } = {}) {
  return {
    id: generateId('section'),
    type: 'section',
    ...(SECTION_KINDS.includes(kind) && { kind }),
    label,
    props: {},
    columns: Array.from({ length: Math.max(1, columns) }, createColumn),
  }
}

const STOCK_COMPONENTS = {
  logo: {
    name: 'Company Logo',
    component_name: 'Company Logo',
    component_type: 'Image',
    configuration_json: { source: 'company_logo', max_height: 60, align: 'left' },
  },
  text: { name: 'Text', component_name: 'Text', component_type: 'Text' },
  pageNumber: {
    name: 'Page Number',
    component_name: 'Page Number',
    component_type: 'Page Number',
    configuration_json: { prefix: 'Page', separator: 'of' },
  },
}

export const defaultTitle = (doctype) => (doctype || 'Document').toUpperCase()

export function createDefaultLayout(doctype = null) {
  const header = createSection({ kind: 'header', columns: 2 })
  header.columns[0].fields.push(createComponentNode(STOCK_COMPONENTS.logo))

  const title = createComponentNode({
    ...STOCK_COMPONENTS.text,
    configuration_json: { text: defaultTitle(doctype) },
  })
  title.props = { align: 'right' }
  const name = createField({ fieldname: 'name', label: 'ID', fieldtype: 'Data' })
  name.props = { hideLabel: true, align: 'right' }
  header.columns[1].fields.push(title, name)

  const footer = createSection({ kind: 'footer' })
  const pageNumber = createComponentNode(STOCK_COMPONENTS.pageNumber)
  pageNumber.props = { align: 'center' }
  footer.columns[0].fields.push(pageNumber)

  return { sections: [header, createSection({ columns: 2 }), footer] }
}

export function isDefaultLayout(layout, doctype) {
  const strip = (value) =>
    JSON.stringify(value, (key, v) => (key === 'id' ? undefined : v))
  return strip(layout) === strip(createDefaultLayout(doctype))
}

export const SECTION_KINDS = ['header', 'footer']

export const findSectionByKind = (layout, kind) =>
  layout.sections?.find((section) => section.kind === kind) || null

export function bodyRange(layout) {
  const sections = layout.sections || []
  const start = sections[0]?.kind === 'header' ? 1 : 0
  const end = sections.at(-1)?.kind === 'footer' ? sections.length - 1 : sections.length
  return { start, end }
}

export function findNode(root, id) {
  if (!root || id == null) return null
  if (root.id === id) return root
  for (const child of childrenOf(root)) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

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

export function removeNode(root, id) {
  const location = findParent(root, id)
  if (!location) return null
  const [node] = location.list.splice(location.index, 1)
  return node
}

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
