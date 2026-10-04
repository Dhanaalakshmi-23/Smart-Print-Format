import { columnWidthTotal, isTableField, resolveField, tableSettings } from './fieldResolver'
import { SECTION_KINDS, isValidColor } from './layout'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const sectionLocation = (section, i) =>
  section?.kind === 'header' ? 'Header' : section?.kind === 'footer' ? 'Footer' : `Section ${i + 1}`

export function validateLayout(layout, { meta = null, getChildMeta = null } = {}) {
  const issues = []
  const seenIds = new Set()

  const report = (level, node, location, message) =>
    issues.push({ level, nodeId: node?.id ?? null, location, message })

  function checkNode(node, expectedType, location) {
    if (!isObject(node)) {
      report('error', null, location, `Expected a ${expectedType}, found ${JSON.stringify(node)}.`)
      return false
    }
    if (node.type !== expectedType) {
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
    } else {
      for (const message of propIssues(node.props || {})) report('error', node, location, message)
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
      return
    }
    const info = meta ? resolveField(field.fieldname, meta, getChildMeta) : null
    if (meta && !info) {
      report('error', field, location, `Field '${field.fieldname}' does not exist in ${meta.name}.`)
      return
    }
    for (const issue of tableIssues(field, info || field, { meta, getChildMeta })) {
      report('error', field, location, issue)
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

    fields.forEach((item, i) =>
      item?.type === 'component'
        ? checkComponent(item, `${location} › Component ${i + 1}`)
        : checkField(item, `${location} › Field ${i + 1}`),
    )
  }

  function checkSection(section, location, index, count) {
    if (!checkNode(section, 'section', location)) return

    if (section.kind !== undefined && !SECTION_KINDS.includes(section.kind)) {
      report('error', section, location, `Unknown section kind '${section.kind}'.`)
    } else if (section.kind === 'header' && index !== 0) {
      report('error', section, location, 'The header section must be the first section.')
    } else if (section.kind === 'footer' && index !== count - 1) {
      report('error', section, location, 'The footer section must be the last section.')
    }
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
    layout.sections.forEach((section, i, all) =>
      checkSection(section, sectionLocation(section, i), i, all.length),
    )
  }

  const errors = issues.filter((issue) => issue.level === 'error')
  const warnings = issues.filter((issue) => issue.level === 'warning')
  return { valid: errors.length === 0, errors, warnings }
}

const inRange = (value, min, max) => typeof value === 'number' && value >= min && value <= max

// Style props, with the limits of layout_schema.json.
function propIssues(props) {
  const issues = []
  if (props.color !== undefined && !isValidColor(props.color)) {
    issues.push(`Color '${props.color}' is not valid; use a hex color like #1f2328.`)
  }
  if (props.fontSize !== undefined && !inRange(props.fontSize, 6, 72)) {
    issues.push('Font size must be between 6 and 72 px.')
  }
  if (props.width !== undefined && !inRange(props.width, 1, 100)) {
    issues.push('Width must be between 1% and 100%.')
  }
  if (props.align !== undefined && !['left', 'center', 'right'].includes(props.align)) {
    issues.push(`Text align '${props.align}' is not valid.`)
  }
  if (typeof props.condition === 'string' && props.condition.length > 500) {
    issues.push('Condition is too long (500 characters at most).')
  }
  return issues
}

export function tableIssues(node, info, { meta = null, getChildMeta = null } = {}) {
  const props = node?.props || {}
  const hasTableProps = ['columns', 'showHeader', 'showTotal', 'totalField'].some((key) => key in props)
  if (!isTableField(info)) {
    return hasTableProps ? ['Only table fields can have table settings (columns, header, total).'] : []
  }

  const issues = []
  const childMeta = getChildMeta?.(info.options) || null
  const settings = tableSettings(node, childMeta)
  const seen = new Set()
  for (const column of settings.configured ? settings.columns : []) {
    if (seen.has(column.fieldname)) issues.push(`Table column '${column.fieldname}' is listed twice.`)
    seen.add(column.fieldname)
    if (childMeta && !column.df) issues.push(`Table column '${column.fieldname}' does not exist in ${info.options}.`)
  }
  const total = columnWidthTotal(settings.columns)
  if (total > 100) {
    issues.push(`Table column widths add up to ${total}%; they may add up to 100% at most.`)
  }
  if (settings.showTotal && !settings.totalField) {
    issues.push("Choose the field to show in the table's total row.")
  } else if (settings.showTotal && meta && !resolveField(settings.totalField, meta, getChildMeta)) {
    issues.push(`Total field '${settings.totalField}' does not exist in ${meta.name}.`)
  }
  return issues
}

export function locateNode(layout, id) {
  const sections = layout?.sections || []
  for (const [i, section] of sections.entries()) {
    const sectionLabel = sectionLocation(section, i)
    if (section?.id === id) return sectionLabel
    for (const [j, column] of (section?.columns || []).entries()) {
      const columnLabel = `${sectionLabel} › Column ${j + 1}`
      if (column?.id === id) return columnLabel
      for (const [k, item] of (column?.fields || []).entries()) {
        if (item?.id === id) {
          return `${columnLabel} › ${item.type === 'component' ? 'Component' : 'Field'} ${k + 1}`
        }
      }
    }
  }
  return null
}
