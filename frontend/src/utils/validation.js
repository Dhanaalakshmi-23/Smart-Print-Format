// Validate a layout before saving or previewing it.
//
//   const { valid, errors, warnings } = validateLayout(layout, { meta, getChildMeta })
//
// Each issue is { level, nodeId, location, message }:
// - level:    'error' blocks saving, 'warning' is only a hint
// - nodeId:   id of the offending node (null for the layout itself), so the
//             UI can highlight it
// - location: readable position, e.g. "Section 2 › Column 1 › Field 3"
//
// `meta` is optional; without it field names aren't checked against the DocType.

import { resolveField } from './fieldResolver'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

export function validateLayout(layout, { meta = null, getChildMeta = null } = {}) {
  const issues = []
  const seenIds = new Set()

  const report = (level, node, location, message) =>
    issues.push({ level, nodeId: node?.id ?? null, location, message })

  // Shared checks for every node: it's an object, has the right type,
  // a unique id, and object-shaped props. Returns false when the node is
  // too broken to check its children.
  function checkNode(node, expectedType, location) {
    if (!isObject(node)) {
      report('error', null, location, `Expected a ${expectedType}, found ${JSON.stringify(node)}.`)
      return false
    }
    if (node.type !== expectedType) {
      // Stop here: checking its children too would only add noise.
      report('error', node, location, `Expected a ${expectedType}, found type '${node.type ?? 'missing'}'.`)
      return false
    }
    if (!node.id || typeof node.id !== 'string') {
      report('error', node, location, 'Missing id.')
    } else if (seenIds.has(node.id)) {
      report('error', node, location, `Duplicate id '${node.id}'.`)
    } else {
      seenIds.add(node.id)
    }
    if (node.props !== undefined && !isObject(node.props)) {
      report('error', node, location, 'Props must be an object.')
    }
    return true
  }

  function checkChildren(node, key, location) {
    if (!Array.isArray(node[key])) {
      report('error', node, location, `Missing '${key}' list.`)
      return []
    }
    return node[key]
  }

  function checkField(field, location) {
    if (!checkNode(field, 'field', location)) return
    if (!field.fieldname) {
      report('error', field, location, 'Field has no fieldname.')
    } else if (meta && !resolveField(field.fieldname, meta, getChildMeta)) {
      report('error', field, location, `Field '${field.fieldname}' does not exist in ${meta.name}.`)
    }
  }

  function checkComponent(node, location) {
    if (!checkNode(node, 'component', location)) return
    if (!node.component) {
      report('error', node, location, 'Component node has no component name.')
    }
  }

  function checkColumn(column, location) {
    if (!checkNode(column, 'column', location)) return
    const fields = checkChildren(column, 'fields', location)
    if (Array.isArray(column.fields) && !fields.length) {
      report('warning', column, location, 'Column is empty.')
    }
    // Columns hold fields and reusable components.
    fields.forEach((item, i) =>
      item?.type === 'component'
        ? checkComponent(item, `${location} › Component ${i + 1}`)
        : checkField(item, `${location} › Field ${i + 1}`),
    )
  }

  function checkSection(section, location) {
    if (!checkNode(section, 'section', location)) return
    const columns = checkChildren(section, 'columns', location)
    if (Array.isArray(section.columns) && !columns.length) {
      report('error', section, location, 'Section has no columns.')
    }
    columns.forEach((column, i) => checkColumn(column, `${location} › Column ${i + 1}`))
  }

  if (!isObject(layout)) {
    report('error', null, 'Layout', 'Layout must be an object.')
  } else if (!Array.isArray(layout.sections)) {
    report('error', null, 'Layout', "Layout must contain a 'sections' list.")
  } else if (!layout.sections.length) {
    report('warning', null, 'Layout', 'Layout has no sections yet.')
  } else {
    layout.sections.forEach((section, i) => checkSection(section, `Section ${i + 1}`))
  }

  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  return { valid: errors.length === 0, errors, warnings }
}
