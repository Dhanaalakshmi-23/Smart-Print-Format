import { isTableField, resolveField, resolveLabel, tableSettings } from './fieldResolver'
import { isValidColor } from './layout'

export const DEFAULT_TEXT_COLOR = '#1f2328'

export const FOOTER_PAGE_LINE = 'Page {{ page_no }} of {{ pages }}'

const NUMERIC_FIELDTYPES = ['Currency', 'Float', 'Int', 'Percent']

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c])
}

const validWidth = (value) => {
  const width = Number(value)
  return width > 0 && width <= 100 ? width : null
}

function styleRules(props = {}, { width = true } = {}) {
  const rules = []
  if (props.bold) rules.push('font-weight: bold')
  if (['left', 'center', 'right'].includes(props.align)) rules.push(`text-align: ${props.align}`)
  const size = Number(props.fontSize)
  if (size >= 6 && size <= 72) rules.push(`font-size: ${size}px`)
  if (isValidColor(props.color)) rules.push(`color: ${props.color}`)
  if (width && validWidth(props.width)) rules.push(`width: ${validWidth(props.width)}%`)
  return rules
}

export function propsToStyle(props = {}) {
  const rules = styleRules(props)
  if (validWidth(props.width)) rules.push('box-sizing: border-box')
  return rules.join('; ')
}

export function columnFlexStyle(props = {}) {
  const width = validWidth(props.width)
  return width ? `flex: 0 1 ${width}%` : ''
}

export function canvasStyle(props = {}) {
  return propsToStyle({ ...props, color: undefined })
}

const placeholder = (text) => `<span class="spf-placeholder">${escapeHtml(text)}</span>`
const jinja = (code) => `<code class="spf-jinja">${escapeHtml(code)}</code>`

function formatValue(value, fieldtype) {
  if (value == null || value === '') return ''
  if (fieldtype === 'Check') return value ? 'Yes' : 'No'
  return escapeHtml(value)
}

function jinjaExpression(path) {
  const [table, ...rest] = path.split('.')
  return rest.length ? `doc.${table}[0].${rest.join('.')}` : `doc.${path}`
}

function valuePlaceholder(path, ctx) {
  return ctx.placeholders === 'jinja' ? jinja(`{{ ${jinjaExpression(path)} }}`) : placeholder(path)
}

function docValue(path, ctx, fieldtype) {
  const [table, ...rest] = path.split('.')
  const value = rest.length ? ctx.doc?.[table]?.[0]?.[rest.join('.')] : ctx.doc?.[path]
  return formatValue(value, fieldtype)
}

function nodeClass(node, ctx, extra = [], { width = true } = {}) {
  const cls = `spf-n-${String(node.id).replace(/[^A-Za-z0-9_-]/g, '')}`
  const rules = [...styleRules(node.props, { width }), ...extra]
  if (rules.length) ctx.css.push(`.spf-print .${cls} { ${rules.join('; ')}; }`)
  return cls
}

function conditional(node, html) {
  const condition = node.props?.condition?.trim()
  if (!condition || !html) return html
  return (
    `<div class="spf-conditional"><span class="spf-cond-badge" title="${escapeHtml(`Shown if: ${condition}`)}">if</span>` +
    `${html}</div>`
  )
}

function renderTable(field, info, ctx) {
  const childMeta = ctx.getChildMeta?.(info.options)
  const settings = tableSettings(field, childMeta)
  const { columns } = settings
  if (!columns.length) return valuePlaceholder(field.fieldname, ctx)

  const cls = nodeClass(field, ctx)
  const rows = Array.isArray(ctx.doc?.[field.fieldname]) ? ctx.doc[field.fieldname] : null
  const useJinja = !rows && ctx.placeholders === 'jinja'
  const num = (column) => (NUMERIC_FIELDTYPES.includes(column.df?.fieldtype) ? ' class="spf-num"' : '')
  const cellPlaceholder = (column) =>
    useJinja ? jinja(`{{ row.${column.fieldname} }}`) : placeholder(column.fieldname)

  const cols = columns
    .map((column, i) => {
      if (column.width) ctx.css.push(`.spf-print .${cls}-c${i} { width: ${column.width}%; }`)
      return `<col class="${cls}-c${i}">`
    })
    .join('')
  const head = settings.showHeader
    ? `<thead><tr>${columns.map((c) => `<th${num(c)}>${escapeHtml(c.label)}</th>`).join('')}</tr></thead>`
    : ''
  const body = rows
    ? rows
        .map(
          (row) =>
            `<tr>${columns.map((c) => `<td${num(c)}>${formatValue(row[c.fieldname], c.df?.fieldtype)}</td>`).join('')}</tr>`,
        )
        .join('')
    : `<tr>${columns.map((c) => `<td${num(c)}>${cellPlaceholder(c)}</td>`).join('')}</tr>`
  const loop = useJinja
    ? `<tr class="spf-loop"><td colspan="${columns.length}">${jinja(`{% for row in doc.${field.fieldname} %}`)}</td></tr>`
    : ''
  const loopEnd = useJinja
    ? `<tr class="spf-loop"><td colspan="${columns.length}">${jinja('{% endfor %}')}</td></tr>`
    : ''

  let foot = ''
  if (settings.showTotal && settings.totalField) {
    const totalInfo = resolveField(settings.totalField, ctx.meta, ctx.getChildMeta)
    const label = escapeHtml(totalInfo?.label || settings.totalField)
    const value = ctx.doc
      ? docValue(settings.totalField, ctx, totalInfo?.fieldtype)
      : valuePlaceholder(settings.totalField, ctx)
    foot =
      columns.length === 1
        ? `<tfoot><tr class="spf-total-row"><td>${label}: ${value}</td></tr></tfoot>`
        : `<tfoot><tr class="spf-total-row"><td colspan="${columns.length - 1}">${label}</td><td class="spf-num">${value}</td></tr></tfoot>`
  }

  const caption =
    field.props?.label && !field.props?.hideLabel
      ? `<div class="spf-label">${escapeHtml(field.props.label)}</div>`
      : ''
  return (
    `<div class="${cls}" data-node-id="${escapeHtml(field.id)}">${caption}<table class="spf-table">` +
    `<colgroup>${cols}</colgroup>${head}<tbody>${loop}${body}${loopEnd}</tbody>${foot}</table></div>`
  )
}

function renderField(field, ctx, { total = false } = {}) {
  const props = field.props || {}
  if (props.hidden) return ''

  const info = resolveField(field.fieldname, ctx.meta, ctx.getChildMeta)
  if (isTableField(info) && !field.fieldname.includes('.')) {
    return conditional(field, renderTable(field, info, ctx))
  }

  const label = props.label || field.label || resolveLabel(field.fieldname, ctx.meta, ctx.getChildMeta)
  const fieldtype = info?.fieldtype || field.fieldtype
  const value = ctx.doc ? docValue(field.fieldname, ctx, fieldtype) : valuePlaceholder(field.fieldname, ctx)
  const cls = nodeClass(field, ctx)
  const id = `data-node-id="${escapeHtml(field.id)}"`

  let html
  if (total) {
    const prefix = props.hideLabel ? '' : `${escapeHtml(label)}: `
    html = `<div class="spf-total ${cls}" ${id}>${prefix}${value}</div>`
  } else {
    const labelHtml = props.hideLabel ? '' : `<div class="spf-label">${escapeHtml(label)}</div>`
    html = `<div class="spf-field ${cls}" ${id}>${labelHtml}<div class="spf-value">${value}</div></div>`
  }
  return conditional(field, html)
}

function sanitizeHtml(html) {
  if (typeof DOMParser === 'undefined') return escapeHtml(html)
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((el) => el.remove())
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const value = attr.value.trim().toLowerCase()
      if (attr.name.startsWith('on') || value.startsWith('javascript:')) el.removeAttribute(attr.name)
    }
  })
  return doc.body.innerHTML
}

function renderComponent(node, ctx) {
  const props = node.props || {}
  if (props.hidden) return ''
  const config = node.configuration || {}
  const id = `data-node-id="${escapeHtml(node.id)}"`
  let html

  switch (node.component_type) {
    case 'Image': {
      const cls = nodeClass(node, ctx, config.align ? [`text-align: ${config.align}`] : [])
      html =
        config.source === 'url' && /^(https?:\/\/|\/files\/)/.test(config.url || '')
          ? `<div class="${cls}" ${id}><img class="spf-logo" src="${escapeHtml(config.url)}" alt=""></div>`
          : `<div class="${cls}" ${id}><span class="spf-logo-box">Company logo</span></div>`
      break
    }
    case 'Divider':
      html = `<hr class="spf-divider ${nodeClass(node, ctx)}" ${id}>`
      break
    case 'HTML':
      html = `<div class="spf-html ${nodeClass(node, ctx)}" ${id}>${sanitizeHtml(config.html)}</div>`
      break
    case 'Page Number': {
      const prefix = escapeHtml(config.prefix || 'Page')
      const separator = escapeHtml(config.separator || 'of')
      const numbers =
        ctx.placeholders === 'jinja' && !ctx.doc
          ? `${jinja('{{ page_no }}')} ${separator} ${jinja('{{ pages }}')}`
          : `1 ${separator} 1`
      html = `<div class="spf-page-number ${nodeClass(node, ctx)}" ${id}>${prefix} ${numbers}</div>`
      break
    }
    case 'Text':
      html = `<div class="spf-text ${nodeClass(node, ctx)}" ${id}>${escapeHtml(config.text || '').replace(/\n/g, '<br>')}</div>`
      break
    case 'Signature': {
      const width = Number(config.line_width)
      const rules = width >= 20 && width <= 600 ? [`width: ${width}px`] : []
      html =
        `<div class="spf-signature ${nodeClass(node, ctx, rules)}" ${id}>` +
        `<div class="spf-signature-line"></div><div class="spf-label">${escapeHtml(config.label || 'Signature')}</div></div>`
      break
    }
    default:
      html = `<div class="spf-component ${nodeClass(node, ctx)}" ${id}>${placeholder(node.component_name || node.component)}</div>`
  }
  return conditional(node, html)
}

function renderColumn(column, ctx) {
  const width = validWidth(column.props?.width)
  const cls = nodeClass(column, ctx, width ? [`width: ${width}%`] : [], { width: false })
  let afterTable = false
  const items = (column.fields || [])
    .map((item) => {
      if (item.type === 'component') return renderComponent(item, ctx)
      const html = renderField(item, ctx, { total: afterTable })
      if (isTableField(item) && !item.fieldname.includes('.')) afterTable = true
      return html
    })
    .join('')

  return `<div class="spf-col ${cls}" data-node-id="${escapeHtml(column.id)}">${conditional(column, items)}</div>`
}

function renderSection(section, ctx) {
  if (section.props?.hidden) return ''
  const columns = (section.columns || []).filter((column) => !column.props?.hidden)
  if (!columns.length) return ''

  const template = columns
    .map((column) => (validWidth(column.props?.width) ? `${validWidth(column.props.width)}%` : 'minmax(0, 1fr)'))
    .join(' ')
  const cls = nodeClass(section, ctx)
  ctx.css.push(`@supports (display: grid) { .spf-print .${cls} { grid-template-columns: ${template}; } }`)

  const label = section.props?.label || section.label
  const heading = label ? `<div class="spf-section-label">${escapeHtml(label)}</div>` : ''
  const kind = ['header', 'footer'].includes(section.kind) ? ` spf-${section.kind}` : ''
  const cells = columns.map((column) => renderColumn(column, ctx)).join('')
  return conditional(
    section,
    `${heading}<div class="spf-section spf-cols-${columns.length}${kind} ${cls}" data-node-id="${escapeHtml(section.id)}">${cells}</div>`,
  )
}

export const PREVIEW_CSS = `
.spf-print { font-family: sans-serif; font-size: 12px; color: ${DEFAULT_TEXT_COLOR}; }
.spf-print .spf-section { display: table; table-layout: fixed; width: 100%; margin-bottom: 12px; }
.spf-print .spf-col { display: table-cell; vertical-align: top; padding-right: 12px; }
.spf-print .spf-col:last-child { padding-right: 0; }
@supports (display: grid) {
  .spf-print .spf-section { display: grid; column-gap: 12px; }
  .spf-print .spf-col { display: block; padding-right: 0; min-width: 0; }
}
.spf-print .spf-section-label { font-size: 13px; font-weight: bold; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #d1d8dd; }
.spf-print .spf-field { margin-bottom: 6px; }
.spf-print .spf-label { font-size: 10px; color: #6c7680; }
.spf-print .spf-total { margin: 6px 0; text-align: right; font-weight: bold; }
.spf-print .spf-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
.spf-print .spf-table th, .spf-print .spf-table td { border: 1px solid #d1d8dd; padding: 4px 6px; text-align: left; vertical-align: top; }
.spf-print .spf-table th { background: #f4f5f6; font-size: 11px; }
.spf-print .spf-table .spf-num { text-align: right; }
.spf-print .spf-table .spf-total-row td { font-weight: bold; background: #f4f5f6; }
.spf-print .spf-table .spf-loop td { border-style: dashed; color: #8d99a6; }
.spf-print .spf-logo { max-width: 100%; max-height: 60px; }
.spf-print .spf-logo-box { display: inline-block; padding: 14px 18px; font-size: 11px; color: #8d99a6; border: 1px dashed #c0c6cc; }
.spf-print .spf-divider { border: 0; border-top: 1px solid #d1d8dd; margin: 8px 0; }
.spf-print .spf-signature { margin-top: 32px; display: inline-block; text-align: center; }
.spf-print .spf-signature-line { border-top: 1px solid #1f2328; margin-bottom: 4px; }
.spf-print .spf-page-number { font-size: 10px; color: #6c7680; text-align: center; }
.spf-print .spf-placeholder { color: #8d99a6; font-style: italic; }
.spf-print .spf-jinja { font: 11px ui-monospace, Consolas, monospace; color: #6d28d9; background: #f5f3ff; border-radius: 3px; padding: 0 3px; }
.spf-print .spf-conditional { position: relative; outline: 1px dashed #f0883e; outline-offset: 2px; }
.spf-print .spf-cond-badge { position: absolute; top: -8px; right: -4px; z-index: 1; padding: 0 4px; font: bold 9px/14px sans-serif; color: #fff; background: #db6d28; border-radius: 3px; cursor: help; }
#footer-html { margin-top: 24px; }
`.trim()

export function generatePreview(
  layout,
  { meta = null, getChildMeta = null, doc = null, placeholders = 'fieldname' } = {},
) {
  const ctx = { meta, getChildMeta, doc, placeholders, css: [] }
  const body = []
  let footer = ''
  for (const section of layout?.sections || []) {
    const html = renderSection(section, ctx)
    if (section.kind === 'footer') footer = html
    else body.push(html)
  }
  if (footer) {
    body.push(`<div id="footer-html" class="spf-footer"><div class="spf-print">${footer}</div></div>`)
  }
  return {
    html: `<div class="spf-print">${body.join('')}</div>`,
    css: [PREVIEW_CSS, ...ctx.css].join('\n'),
  }
}
