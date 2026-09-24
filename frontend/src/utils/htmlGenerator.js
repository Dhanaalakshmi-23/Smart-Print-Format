// Client-side PREVIEW of a layout, for the designer canvas only.
//
// This is not the real print output: the printed document is still rendered
// by Frappe's Print Format / Jinja on the server. The preview just shows the
// structure, using sample values from `doc` when given, or placeholders.
//
//   const { html, css } = generatePreview(layout, { meta, getChildMeta, doc })
//
// Supported node props (all optional):
//   hidden, hideLabel, label (fields and sections), bold, align ('left'|'center'|'right'),
//   fontSize (px number), color (hex or CSS color name),
//   width (% of the parent; for columns, % of the section row)

import { getTableColumns, isTableField, resolveField, resolveLabel } from './fieldResolver'

// ---- Escaping: every value from the layout or doc goes through these ----

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

// Only allow known-safe values into inline styles. Also used by the canvas
// blocks, so the canvas and the preview style nodes the same way.
export function propsToStyle(props = {}) {
  const rules = []
  if (props.bold) rules.push('font-weight: bold')
  if (['left', 'center', 'right'].includes(props.align)) rules.push(`text-align: ${props.align}`)
  const size = Number(props.fontSize)
  if (size > 0 && size <= 72) rules.push(`font-size: ${size}px`)
  if (/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(props.color || '')) rules.push(`color: ${props.color}`)
  const width = validWidth(props.width)
  if (width) rules.push(`width: ${width}%`, 'box-sizing: border-box')
  return rules.join('; ')
}

const validWidth = (value) => {
  const width = Number(value)
  return width > 0 && width <= 100 ? width : null
}

// Columns sit in a flex row, where `width` is ignored: their width is set as
// a flex basis on the column's wrapper instead. Use with propsToStyle on the
// column's own props minus `width`.
export function columnFlexStyle(props = {}) {
  const width = validWidth(props.width)
  return width ? `flex: 0 1 ${width}%` : ''
}

function styleFromProps(props = {}) {
  const style = propsToStyle(props)
  return style ? ` style="${escapeHtml(style)}"` : ''
}

function formatValue(value, fieldtype) {
  if (value == null || value === '') return ''
  if (fieldtype === 'Check') return value ? 'Yes' : 'No'
  return escapeHtml(value)
}

const placeholder = (text) => `<span class="spf-placeholder">${escapeHtml(text)}</span>`

// ---- Renderers ----

function renderTable(field, info, ctx) {
  const childMeta = ctx.getChildMeta?.(info.options)
  const columns = getTableColumns(childMeta)
  const rows = Array.isArray(ctx.doc?.[field.fieldname]) ? ctx.doc[field.fieldname] : null

  const head = columns.map((df) => `<th>${escapeHtml(df.label || df.fieldname)}</th>`).join('')
  const body = rows
    ? rows
        .map((row) => `<tr>${columns.map((df) => `<td>${formatValue(row[df.fieldname], df.fieldtype)}</td>`).join('')}</tr>`)
        .join('')
    : `<tr>${columns.map((df) => `<td>${placeholder(df.fieldname)}</td>`).join('')}</tr>`

  return columns.length
    ? `<table class="spf-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    : placeholder(`${field.fieldname} (table)`)
}

function renderField(field, ctx) {
  const props = field.props || {}
  if (props.hidden) return ''

  const info = resolveField(field.fieldname, ctx.meta, ctx.getChildMeta)
  const label =
    props.label || field.label || resolveLabel(field.fieldname, ctx.meta, ctx.getChildMeta)
  const labelHtml = props.hideLabel ? '' : `<div class="spf-label">${escapeHtml(label)}</div>`

  let valueHtml
  if (isTableField(info)) {
    valueHtml = renderTable(field, info, ctx)
  } else if (ctx.doc) {
    valueHtml = formatValue(ctx.doc[field.fieldname], info?.fieldtype || field.fieldtype)
  } else {
    valueHtml = placeholder(field.fieldname)
  }

  return (
    `<div class="spf-field" data-node-id="${escapeHtml(field.id)}"${styleFromProps(props)}>` +
    `${labelHtml}<div class="spf-value">${valueHtml}</div></div>`
  )
}

// The real component output is rendered by the server; show a labelled box.
function renderComponent(node) {
  if (node.props?.hidden) return ''
  return (
    `<div class="spf-component" data-node-id="${escapeHtml(node.id)}"${styleFromProps(node.props)}>` +
    `${placeholder(`${node.component_type || 'Component'}: ${node.component_name || node.component}`)}</div>`
  )
}

function renderColumn(column, ctx) {
  if (column.props?.hidden) return ''
  const { width, ...props } = column.props || {}
  const style = [columnFlexStyle(column.props), propsToStyle(props)].filter(Boolean).join('; ')
  const fields = (column.fields || [])
    .map((item) => (item.type === 'component' ? renderComponent(item) : renderField(item, ctx)))
    .join('')
  const styleAttr = style ? ` style="${escapeHtml(style)}"` : ''
  return `<div class="spf-column" data-node-id="${escapeHtml(column.id)}"${styleAttr}>${fields}</div>`
}

function renderSection(section, ctx) {
  if (section.props?.hidden) return ''
  const label = section.props?.label || section.label
  const heading = label ? `<h3 class="spf-section-label">${escapeHtml(label)}</h3>` : ''
  const columns = (section.columns || []).map((column) => renderColumn(column, ctx)).join('')
  return (
    `<section class="spf-section" data-node-id="${escapeHtml(section.id)}"${styleFromProps(section.props)}>` +
    `${heading}<div class="spf-columns">${columns}</div></section>`
  )
}

// ---- Public API ----

export const PREVIEW_CSS = `
.spf-preview { font-family: sans-serif; font-size: 12px; color: #1f272e; }
.spf-section { margin-bottom: 16px; }
.spf-section-label { font-size: 14px; margin: 0 0 8px; border-bottom: 1px solid #d1d8dd; padding-bottom: 4px; }
.spf-columns { display: flex; gap: 16px; }
.spf-column { flex: 1; min-width: 0; }
.spf-field { margin-bottom: 8px; }
.spf-label { color: #6c7680; font-size: 11px; }
.spf-placeholder { color: #8d99a6; font-style: italic; }
.spf-component { margin-bottom: 8px; padding: 8px; border: 1px dashed #d1d8dd; }
.spf-table { width: 100%; border-collapse: collapse; }
.spf-table th, .spf-table td { border: 1px solid #d1d8dd; padding: 4px 6px; text-align: left; }
`.trim()

export function generatePreview(layout, { meta = null, getChildMeta = null, doc = null } = {}) {
  const ctx = { meta, getChildMeta, doc }
  const sections = (layout?.sections || []).map((section) => renderSection(section, ctx)).join('')
  return {
    html: `<div class="spf-preview">${sections}</div>`,
    css: PREVIEW_CSS,
  }
}
