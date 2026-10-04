import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import * as api from '@/api/smartPrintApi'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import { useDesigner } from '@/composables/useDesigner'
import { useHistory } from '@/composables/useHistory'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { canvasStyle, escapeHtml, generatePreview, propsToStyle } from '@/utils/htmlGenerator'
import { createDefaultLayout, findNode, findParent } from '@/utils/layout'
import { parseLayout, stringifyLayout } from '@/utils/layoutSerializer'
import { locateNode, tableIssues, validateLayout } from '@/utils/validation'

vi.mock('@/api/smartPrintApi', () => ({
  validateLayoutOnServer: vi.fn(),
  saveSmartPrintFormat: vi.fn(),
  publishSmartPrintFormat: vi.fn(),
  getSmartPrintFormat: vi.fn(),
}))

// useDesigner is a singleton bound to the first store, so one pinia serves every test.
const pinia = createPinia()
setActivePinia(pinia)
const store = useSmartPrintStore()
const designer = useDesigner()

// ---- Sample DocType metadata and layouts ----

const invoiceMeta = {
  name: 'Sales Invoice',
  fields: [
    { fieldname: 'customer', label: 'Customer', fieldtype: 'Link', options: 'Customer' },
    { fieldname: 'posting_date', label: 'Posting Date', fieldtype: 'Date' },
    { fieldname: 'items', label: 'Items', fieldtype: 'Table', options: 'Sales Invoice Item' },
    { fieldname: 'grand_total', label: 'Grand Total', fieldtype: 'Currency' },
  ],
}

const itemMeta = {
  name: 'Sales Invoice Item',
  fields: [
    { fieldname: 'item_name', label: 'Item', fieldtype: 'Data', in_list_view: 1 },
    { fieldname: 'qty', label: 'Qty', fieldtype: 'Float', in_list_view: 1 },
    { fieldname: 'rate', label: 'Rate', fieldtype: 'Currency', in_list_view: 1 },
    { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency', in_list_view: 1 },
    { fieldname: 'description', label: 'Description', fieldtype: 'Text' },
  ],
}

const getChildMeta = (doctype) => (doctype === 'Sales Invoice Item' ? itemMeta : null)

const field = (id, fieldname, extra = {}) => ({ id, type: 'field', fieldname, props: {}, ...extra })

const column = (id, fields = [], props = {}) => ({ id, type: 'column', props, fields })

const section = (id, columns, extra = {}) => ({ id, type: 'section', label: '', props: {}, columns, ...extra })

// Header, one body section with two columns, footer.
function sampleLayout() {
  return {
    sections: [
      section('head', [column('head_c1', [field('f_name', 'name')])], { kind: 'header' }),
      section('body', [
        column('c1', [field('f_customer', 'customer'), field('f_date', 'posting_date')]),
        column('c2', [field('f_total', 'grand_total')]),
      ]),
      section('foot', [column('foot_c1')], { kind: 'footer' }),
    ],
  }
}

describe('useDesigner', () => {
  const sections = () => store.layoutJson.sections
  const ids = (list) => list.map((node) => node.id)

  beforeEach(() => {
    store.newSPF({}, sampleLayout())
  })

  describe('addSection', () => {
    it('adds a body section before the footer', () => {
      const id = designer.addSection({ label: 'Notes', columns: 2 })
      expect(ids(sections())).toEqual(['head', 'body', id, 'foot'])
      const added = findNode(store.layoutJson, id)
      expect(added.label).toBe('Notes')
      expect(added.columns).toHaveLength(2)
    })

    it('places a body section at an index between header and footer', () => {
      const id = designer.addSection({ index: 0 })
      expect(ids(sections())).toEqual(['head', id, 'body', 'foot'])
    })

    it('returns the existing header instead of adding a second one', () => {
      expect(designer.addSection({ kind: 'header' })).toBe('head')
      expect(sections()).toHaveLength(3)
    })

    it('creates a missing footer at the end', () => {
      store.newSPF({}, { sections: [] })
      const body = designer.addSection()
      const footer = designer.addSection({ kind: 'footer' })
      const header = designer.addSection({ kind: 'header' })
      expect(ids(sections())).toEqual([header, body, footer])
    })
  })

  describe('addField', () => {
    const customer = { fieldname: 'customer', label: 'Customer', fieldtype: 'Link', options: 'Customer' }

    it('adds a field to the given column and index', () => {
      const id = designer.addField(customer, { columnId: 'c2', index: 0 })
      expect(ids(findNode(store.layoutJson, 'c2').fields)).toEqual([id, 'f_total'])
      expect(findNode(store.layoutJson, id)).toMatchObject({ type: 'field', fieldname: 'customer', props: {} })
    })

    it('adds to the column of the selected field', () => {
      designer.selectNode('f_customer')
      const id = designer.addField(customer)
      expect(findParent(store.layoutJson, id).parent.id).toBe('c1')
    })

    it('adds to the last body column when nothing is selected', () => {
      const id = designer.addField(customer)
      expect(findParent(store.layoutJson, id).parent.id).toBe('c2')
    })

    it('creates a new section when asked', () => {
      const id = designer.addField(customer, { newSection: {} })
      expect(sections()).toHaveLength(4)
      expect(sections()[2].columns[0].fields[0].id).toBe(id)
    })

    it('throws for an unknown column and leaves the layout unchanged', () => {
      const before = store.layoutJson
      expect(() => designer.addField(customer, { columnId: 'nope' })).toThrow()
      expect(store.layoutJson).toBe(before)
    })
  })

  describe('moveNode', () => {
    it('reorders fields inside a column', () => {
      designer.moveNode('f_date', 'c1', 0)
      expect(ids(findNode(store.layoutJson, 'c1').fields)).toEqual(['f_date', 'f_customer'])
    })

    it('moves a field to another column', () => {
      designer.moveNode('f_customer', 'c2', 1)
      expect(ids(findNode(store.layoutJson, 'c1').fields)).toEqual(['f_date'])
      expect(ids(findNode(store.layoutJson, 'c2').fields)).toEqual(['f_total', 'f_customer'])
    })

    it('keeps body sections between the header and the footer', () => {
      const id = designer.addSection()
      designer.moveNode(id, null, 0)
      expect(ids(sections())).toEqual(['head', id, 'body', 'foot'])
      designer.moveNode(id, null, 99)
      expect(ids(sections())).toEqual(['head', 'body', id, 'foot'])
    })

    it('refuses to move the header or footer', () => {
      expect(() => designer.moveNode('head', null, 2)).toThrow(/cannot be moved/)
    })

    it('refuses to move a node inside itself', () => {
      expect(() => designer.moveNode('c1', 'c1', 0)).toThrow(/inside itself/)
    })

    it('refuses a node type that does not fit the target', () => {
      expect(() => designer.moveNode('f_total', 'body', 0)).toThrow(/cannot be placed/)
    })

    it('moveNodeBy moves one step and stops at the ends', () => {
      designer.moveNodeBy('f_customer', 1)
      expect(ids(findNode(store.layoutJson, 'c1').fields)).toEqual(['f_date', 'f_customer'])
      designer.moveNodeBy('f_customer', 1)
      expect(ids(findNode(store.layoutJson, 'c1').fields)).toEqual(['f_date', 'f_customer'])
    })
  })

  describe('deleteNode', () => {
    it('removes the node and its children', () => {
      designer.deleteNode('c1')
      expect(findNode(store.layoutJson, 'c1')).toBeNull()
      expect(findNode(store.layoutJson, 'f_customer')).toBeNull()
    })

    it('clears the selection when the selected node is removed', () => {
      designer.selectNode('f_customer')
      designer.deleteNode('c1')
      expect(store.selectedNode).toBeNull()
    })

    it('throws for an unknown node', () => {
      expect(() => designer.deleteNode('nope')).toThrow(/not found/)
    })
  })

  describe('updateProps', () => {
    it('merges props into the node', () => {
      designer.updateProps('f_customer', { bold: true })
      designer.updateProps('f_customer', { fontSize: 14 })
      expect(findNode(store.layoutJson, 'f_customer').props).toEqual({ bold: true, fontSize: 14 })
    })

    it('drops a prop set to undefined', () => {
      designer.updateProps('f_customer', { bold: true, color: '#ff0000' })
      designer.updateProps('f_customer', { color: undefined })
      const clone = JSON.parse(JSON.stringify(store.layoutJson))
      expect(findNode(clone, 'f_customer').props).toEqual({ bold: true })
    })

    it('does not change the previous layout object', () => {
      const before = store.layoutJson
      designer.updateProps('f_customer', { bold: true })
      expect(findNode(before, 'f_customer').props).toEqual({})
    })

    it('selectedNode follows the selection', () => {
      designer.selectNode('f_total')
      designer.updateProps('f_total', { align: 'right' })
      expect(designer.selectedNode.value.props.align).toBe('right')
    })
  })

  describe('undo / redo', () => {
    it('undoes and redoes edits', () => {
      designer.updateProps('f_customer', { bold: true })
      designer.deleteNode('f_date')
      expect(designer.canUndo.value).toBe(true)

      designer.undo()
      expect(findNode(store.layoutJson, 'f_date')).not.toBeNull()
      designer.undo()
      expect(findNode(store.layoutJson, 'f_customer').props).toEqual({})
      expect(designer.canUndo.value).toBe(false)

      designer.redo()
      designer.redo()
      expect(findNode(store.layoutJson, 'f_customer').props).toEqual({ bold: true })
      expect(findNode(store.layoutJson, 'f_date')).toBeNull()
      expect(designer.canRedo.value).toBe(false)
    })

    it('starts a fresh history when another document is opened', () => {
      designer.updateProps('f_customer', { bold: true })
      store.newSPF({}, sampleLayout())
      expect(designer.canUndo.value).toBe(false)
    })
  })
})

describe('useHistory', () => {
  describe('useHistory', () => {
    it('has nothing to undo or redo after reset', () => {
      const history = useHistory()
      history.reset({ n: 0 })
      expect(history.canUndo.value).toBe(false)
      expect(history.canRedo.value).toBe(false)
      expect(history.undo()).toBeNull()
      expect(history.redo()).toBeNull()
    })

    it('undoes and redoes in order', () => {
      const history = useHistory()
      history.reset({ n: 0 })
      history.push({ n: 1 })
      history.push({ n: 2 })

      expect(history.undo()).toEqual({ n: 1 })
      expect(history.undo()).toEqual({ n: 0 })
      expect(history.canUndo.value).toBe(false)
      expect(history.redo()).toEqual({ n: 1 })
      expect(history.redo()).toEqual({ n: 2 })
      expect(history.canRedo.value).toBe(false)
    })

    it('clears redo steps after a new change', () => {
      const history = useHistory()
      history.reset({ n: 0 })
      history.push({ n: 1 })
      history.undo()
      history.push({ n: 5 })
      expect(history.canRedo.value).toBe(false)
      expect(history.undo()).toEqual({ n: 0 })
    })

    it('ignores a push that changes nothing', () => {
      const history = useHistory()
      history.reset({ n: 0 })
      history.push({ n: 0 })
      expect(history.canUndo.value).toBe(false)
    })

    it('returns copies that later edits cannot change', () => {
      const history = useHistory()
      const state = { list: [1] }
      history.reset(state)
      history.push({ list: [1, 2] })
      state.list.push(99)
      expect(history.undo()).toEqual({ list: [1] })
    })

    it('keeps at most `limit` undo steps', () => {
      const history = useHistory({ limit: 2 })
      history.reset({ n: 0 })
      for (let n = 1; n <= 4; n++) history.push({ n })
      expect(history.undo()).toEqual({ n: 3 })
      expect(history.undo()).toEqual({ n: 2 })
      expect(history.undo()).toBeNull()
    })
  })
})

describe('validation', () => {
  const options = { meta: invoiceMeta, getChildMeta }

  // Layout with a single body column holding `items`.
  const withItems = (...items) => ({ sections: [section('s1', [column('c1', items)])] })

  const errorsOf = (layout, opts = options) => validateLayout(layout, opts).errors.map((e) => e.message)

  const itemsTable = (props = {}) =>
    field('t1', 'items', { fieldtype: 'Table', options: 'Sales Invoice Item', props })

  describe('validateLayout: structure', () => {
    it('accepts a valid layout', () => {
      const result = validateLayout(sampleLayout(), options)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts the default layout', () => {
      expect(validateLayout(createDefaultLayout('Sales Invoice'), options).valid).toBe(true)
    })

    it('rejects a layout that is not an object', () => {
      expect(errorsOf(null)).toEqual(['Layout must be an object.'])
      expect(errorsOf([])).toEqual(['Layout must be an object.'])
    })

    it('rejects a layout without a sections list', () => {
      expect(errorsOf({})).toEqual(["Layout must contain a 'sections' list."])
    })

    it('warns about an empty layout', () => {
      const result = validateLayout({ sections: [] })
      expect(result.valid).toBe(true)
      expect(result.warnings[0].message).toBe('Layout has no sections yet.')
    })

    it('reports a node of the wrong type', () => {
      expect(errorsOf({ sections: [column('c1')] })).toEqual(["Expected a section, found type 'column'."])
    })

    it('reports a missing id', () => {
      const layout = withItems(field('', 'customer'))
      expect(errorsOf(layout)).toContain('Missing id.')
    })

    it('reports duplicate ids', () => {
      const layout = withItems(field('dup', 'customer'), field('dup', 'posting_date'))
      expect(errorsOf(layout)).toContain("Duplicate id 'dup'.")
    })

    it('reports a section without columns', () => {
      expect(errorsOf({ sections: [section('s1', [])] })).toEqual(['Section has no columns.'])
    })

    it('warns about an empty column', () => {
      const result = validateLayout(withItems(), options)
      expect(result.valid).toBe(true)
      expect(result.warnings.map((w) => w.message)).toEqual(['Column is empty.'])
    })

    it('reports props that are not an object', () => {
      expect(errorsOf(withItems(field('f1', 'customer', { props: [] })))).toEqual(['Props must be an object.'])
    })

    it('requires the header first and the footer last', () => {
      const layout = sampleLayout()
      layout.sections.reverse()
      expect(errorsOf(layout)).toEqual([
        'The footer section must be the last section.',
        'The header section must be the first section.',
      ])
    })

    it('reports an unknown section kind', () => {
      const layout = { sections: [section('s1', [column('c1')], { kind: 'sidebar' })] }
      expect(errorsOf(layout)).toEqual(["Unknown section kind 'sidebar'."])
    })
  })

  describe('validateLayout: fields and components', () => {
    it('reports a field without fieldname', () => {
      expect(errorsOf(withItems(field('f1', '')))).toEqual(['Field has no fieldname.'])
    })

    it('reports a field that is not in the DocType', () => {
      expect(errorsOf(withItems(field('f1', 'nope')))).toEqual(["Field 'nope' does not exist in Sales Invoice."])
    })

    it('accepts standard fields and child-table paths', () => {
      expect(errorsOf(withItems(field('f1', 'name'), field('f2', 'items.qty')))).toEqual([])
    })

    it('reports an unknown child-table field', () => {
      expect(errorsOf(withItems(field('f1', 'items.nope')))).toEqual([
        "Field 'items.nope' does not exist in Sales Invoice.",
      ])
    })

    it('skips DocType checks without metadata', () => {
      expect(errorsOf(withItems(field('f1', 'nope')), {})).toEqual([])
    })

    it('reports a component without a component name', () => {
      const node = { id: 'k1', type: 'component', component: '', props: {} }
      expect(errorsOf(withItems(node))).toEqual(['Component node has no component name.'])
    })
  })

  describe('validateLayout: props', () => {
    const errorsFor = (props) => errorsOf(withItems(field('f1', 'customer', { props })))

    it('accepts valid style props', () => {
      expect(errorsFor({ color: '#1f2328', fontSize: 12, width: 50, align: 'right', bold: true })).toEqual([])
      expect(errorsFor({ color: '#abc' })).toEqual([])
      expect(errorsFor({ color: 'red' })).toEqual([])
    })

    it.each(['#12345', '#ggg', 'rgb(0,0,0)', 'x', '#1f2328; background: red'])('rejects the color %s', (color) => {
      expect(errorsFor({ color })).toEqual([`Color '${color}' is not valid; use a hex color like #1f2328.`])
    })

    it('rejects a font size out of range', () => {
      expect(errorsFor({ fontSize: 5 })).toEqual(['Font size must be between 6 and 72 px.'])
      expect(errorsFor({ fontSize: '12' })).toEqual(['Font size must be between 6 and 72 px.'])
    })

    it('rejects a width out of range', () => {
      expect(errorsFor({ width: 0 })).toEqual(['Width must be between 1% and 100%.'])
      expect(errorsFor({ width: 120 })).toEqual(['Width must be between 1% and 100%.'])
    })

    it('rejects an unknown alignment', () => {
      expect(errorsFor({ align: 'justify' })).toEqual(["Text align 'justify' is not valid."])
    })

    it('rejects a condition longer than 500 characters', () => {
      expect(errorsFor({ condition: 'x'.repeat(501) })).toEqual(['Condition is too long (500 characters at most).'])
    })
  })

  describe('validateLayout: tables', () => {
    it('accepts table columns that add up to 100%', () => {
      const table = itemsTable({ columns: [{ fieldname: 'item_name', width: 60 }, { fieldname: 'qty', width: 40 }] })
      expect(errorsOf(withItems(table))).toEqual([])
    })

    it('rejects table column widths above 100%', () => {
      const table = itemsTable({ columns: [{ fieldname: 'item_name', width: 70 }, { fieldname: 'qty', width: 40 }] })
      expect(errorsOf(withItems(table))).toEqual([
        'Table column widths add up to 110%; they may add up to 100% at most.',
      ])
    })

    it('rejects unknown and duplicate table columns', () => {
      const table = itemsTable({ columns: [{ fieldname: 'nope' }, { fieldname: 'qty' }, { fieldname: 'qty' }] })
      expect(errorsOf(withItems(table))).toEqual([
        "Table column 'nope' does not exist in Sales Invoice Item.",
        "Table column 'qty' is listed twice.",
      ])
    })

    it('requires a total field when the total row is shown', () => {
      expect(errorsOf(withItems(itemsTable({ showTotal: true })))).toEqual([
        "Choose the field to show in the table's total row.",
      ])
      expect(errorsOf(withItems(itemsTable({ showTotal: true, totalField: 'nope' })))).toEqual([
        "Total field 'nope' does not exist in Sales Invoice.",
      ])
      expect(errorsOf(withItems(itemsTable({ showTotal: true, totalField: 'grand_total' })))).toEqual([])
    })

    it('rejects table settings on a field that is not a table', () => {
      expect(errorsOf(withItems(field('f1', 'customer', { props: { showHeader: false } })))).toEqual([
        'Only table fields can have table settings (columns, header, total).',
      ])
    })

    it('tableIssues checks widths without metadata too', () => {
      const node = itemsTable({ columns: [{ fieldname: 'a', width: 80 }, { fieldname: 'b', width: 30 }] })
      expect(tableIssues(node, node)).toEqual(['Table column widths add up to 110%; they may add up to 100% at most.'])
    })
  })

  describe('issue details', () => {
    it('points each error at its node and location', () => {
      const [error] = validateLayout(withItems(field('f1', 'customer'), field('f2', '')), options).errors
      expect(error).toEqual({
        level: 'error',
        nodeId: 'f2',
        location: 'Section 1 › Column 1 › Field 2',
        message: 'Field has no fieldname.',
      })
    })

    it('locateNode names header, footer, columns and components', () => {
      const layout = sampleLayout()
      layout.sections[1].columns[1].fields.push({ id: 'k1', type: 'component', component: 'Logo' })
      expect(locateNode(layout, 'head')).toBe('Header')
      expect(locateNode(layout, 'foot_c1')).toBe('Footer › Column 1')
      expect(locateNode(layout, 'f_date')).toBe('Section 2 › Column 1 › Field 2')
      expect(locateNode(layout, 'k1')).toBe('Section 2 › Column 2 › Component 2')
      expect(locateNode(layout, 'nope')).toBeNull()
    })
  })
})

describe('htmlGenerator', () => {
  const options = { meta: invoiceMeta, getChildMeta }
  const render = (layout, opts = {}) => generatePreview(layout, { ...options, ...opts })

  const itemsTable = (props = {}) =>
    field('t1', 'items', { fieldtype: 'Table', options: 'Sales Invoice Item', props })

  const bodyWith = (...columns) => ({ sections: [section('s1', columns)] })

  describe('generatePreview: hidden nodes', () => {
    it('leaves out a hidden field', () => {
      const layout = sampleLayout()
      layout.sections[1].columns[0].fields[0].props.hidden = true
      const { html } = render(layout)
      expect(html).not.toContain('data-node-id="f_customer"')
      expect(html).toContain('data-node-id="f_date"')
    })

    it('leaves out a hidden column and gives its space to the others', () => {
      const layout = bodyWith(
        column('c1', [field('f1', 'customer')]),
        column('c2', [field('f2', 'grand_total')], { hidden: true }),
        column('c3', [field('f3', 'posting_date')], { width: 30 }),
      )
      const { html, css } = render(layout)
      expect(html).not.toContain('data-node-id="c2"')
      expect(html).not.toContain('data-node-id="f2"')
      expect(html).toContain('spf-cols-2')
      expect(css).toContain('grid-template-columns: minmax(0, 1fr) 30%;')
    })

    it('leaves out a hidden section, and a section whose columns are all hidden', () => {
      const layout = {
        sections: [
          section('s1', [column('c1', [field('f1', 'customer')])], { props: { hidden: true } }),
          section('s2', [column('c2', [field('f2', 'grand_total')], { hidden: true })]),
          section('s3', [column('c3', [field('f3', 'posting_date')])]),
        ],
      }
      const { html } = render(layout)
      expect(html).not.toContain('data-node-id="s1"')
      expect(html).not.toContain('data-node-id="s2"')
      expect(html).toContain('data-node-id="s3"')
    })

    it('leaves out a hidden component', () => {
      const logo = { id: 'k1', type: 'component', component_type: 'Image', props: { hidden: true } }
      expect(render(bodyWith(column('c1', [logo]))).html).not.toContain('k1')
    })

    it('marks conditional nodes instead of hiding them', () => {
      const layout = bodyWith(column('c1', [field('f1', 'customer', { props: { condition: "doc.customer != ''" } })]))
      const { html } = render(layout)
      expect(html).toContain('spf-cond-badge')
      expect(html).toContain('Shown if: doc.customer != &#39;&#39;')
    })
  })

  describe('generatePreview: table columns', () => {
    it('shows the "In List View" columns by default', () => {
      const { html } = render(bodyWith(column('c1', [itemsTable()])))
      for (const label of ['Item', 'Qty', 'Rate', 'Amount']) expect(html).toContain(`>${label}</th>`)
      expect(html).not.toContain('>Description</th>')
    })

    it('shows only the chosen columns, in order, with their widths and labels', () => {
      const table = itemsTable({
        columns: [
          { fieldname: 'amount', width: 30 },
          { fieldname: 'item_name', label: 'Product', width: 70 },
        ],
      })
      const { html, css } = render(bodyWith(column('c1', [table])))
      const headers = [...html.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])
      expect(headers).toEqual(['Amount', 'Product'])
      expect(css).toContain('-c0 { width: 30%; }')
      expect(css).toContain('-c1 { width: 70%; }')
    })

    it('hides the header row when showHeader is false', () => {
      const { html } = render(bodyWith(column('c1', [itemsTable({ showHeader: false })])))
      expect(html).not.toContain('<thead>')
    })

    it('prints the Jinja loop and a total row', () => {
      const table = itemsTable({ showTotal: true, totalField: 'grand_total' })
      const { html } = render(bodyWith(column('c1', [table])), { placeholders: 'jinja' })
      expect(html).toContain('{% for row in doc.items %}')
      expect(html).toContain('{{ row.qty }}')
      expect(html).toContain('spf-total-row')
      expect(html).toContain('{{ doc.grand_total }}')
    })

    it('prints document rows when a doc is given', () => {
      const doc = { items: [{ item_name: 'Pen', qty: 2, rate: 5, amount: 10 }] }
      const { html } = render(bodyWith(column('c1', [itemsTable()])), { doc })
      expect(html).toContain('<td>Pen</td>')
      expect(html).toContain('<td class="spf-num">10</td>')
    })
  })

  describe('generatePreview: values and styles', () => {
    it('shows placeholders, or values from the document', () => {
      const layout = sampleLayout()
      expect(render(layout, { placeholders: 'jinja' }).html).toContain('{{ doc.customer }}')
      expect(render(layout).html).toContain('<span class="spf-placeholder">customer</span>')
      expect(render(layout, { doc: { customer: 'ACME' } }).html).toContain('>ACME</div>')
    })

    it('escapes values from the document and the layout', () => {
      const layout = bodyWith(column('c1', [field('f1', 'customer', { props: { label: '<b>x</b>' } })]))
      const { html } = render(layout, { doc: { customer: '<script>alert(1)</script>' } })
      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
      expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    })

    it('moves the footer into #footer-html', () => {
      const { html } = render(sampleLayout())
      expect(html).toMatch(/<div id="footer-html"[^>]*>.*data-node-id="foot"/)
    })

    it('writes node styles, ignoring unsafe values', () => {
      expect(propsToStyle({ bold: true, align: 'center', fontSize: 14, color: '#ff0000', width: 50 })).toBe(
        'font-weight: bold; text-align: center; font-size: 14px; color: #ff0000; width: 50%; box-sizing: border-box',
      )
      expect(propsToStyle({ color: 'red;background:url(x)', fontSize: 500, width: 0, align: 'x' })).toBe('')
      expect(canvasStyle({ color: '#ff0000', bold: true })).toBe('font-weight: bold')
    })

    it('escapeHtml escapes every special character', () => {
      expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
      expect(escapeHtml(null)).toBe('')
    })
  })
})

describe('layoutSerializer', () => {
  describe('layoutSerializer', () => {
    it('parses a JSON string or an object', () => {
      expect(parseLayout('{"sections":[]}')).toEqual({ layout: { sections: [] }, error: null })
      const layout = { sections: [{ id: 's1' }] }
      expect(parseLayout(layout).layout).toBe(layout)
    })

    it('treats an empty value as an empty layout', () => {
      expect(parseLayout(null).layout).toEqual({ sections: [] })
      expect(parseLayout('').layout).toEqual({ sections: [] })
    })

    it('returns an error instead of throwing for bad input', () => {
      expect(parseLayout('{oops').error).toMatch(/not valid JSON/)
      expect(parseLayout('[1]').error).toBe('Layout must be a JSON object.')
      expect(parseLayout('{"rows": []}').error).toBe("Layout must contain a 'sections' list.")
      expect(parseLayout('{oops').layout).toBeNull()
    })

    it('stringifies layouts and passes strings through', () => {
      expect(stringifyLayout({ sections: [] })).toBe('{"sections":[]}')
      expect(stringifyLayout(undefined)).toBe('{"sections":[]}')
      expect(stringifyLayout('{"sections":[]}')).toBe('{"sections":[]}')
    })
  })
})

describe('PropertiesPanel', () => {
  const props = (id) => findNode(store.layoutJson, id).props

  function mountWith(selected) {
    store.newSPF({ title: 'Invoice Print' }, sampleLayout())
    designer.selectNode(selected)
    return mount(PropertiesPanel, { global: { plugins: [pinia] } })
  }

  // Inputs commit on `change`, like a user pressing Enter or leaving the box.
  async function type(input, value) {
    await input.setValue(value)
    await input.trigger('change')
  }

  const row = (wrapper, label) =>
    wrapper.findAll('.panel__row').find((el) => el.find('span').text() === label)

  describe('PropertiesPanel', () => {
    beforeEach(() => store.newSPF({}, sampleLayout()))

    it('shows the selected field', () => {
      const wrapper = mountWith('f_customer')
      expect(wrapper.find('.panel__title').text()).toBe('Customer Field')
      expect(row(wrapper, 'Label').find('input').element.value).toBe('Customer')
    })

    it('updates the label of the selected node', async () => {
      const wrapper = mountWith('f_customer')
      await type(row(wrapper, 'Label').find('input'), 'Bill To')
      expect(props('f_customer').label).toBe('Bill To')
      expect(wrapper.find('.panel__title').text()).toBe('Bill To Field')
    })

    it('stores font size and width as numbers, clamped', async () => {
      const wrapper = mountWith('f_customer')
      await type(row(wrapper, 'Font Size').find('input'), '14px')
      await type(row(wrapper, 'Width').find('input'), '0')
      expect(props('f_customer')).toMatchObject({ fontSize: 14, width: 1 })
      expect(row(wrapper, 'Font Size').find('input').element.value).toBe('14px')
      // 100% is a field's default width, so it clears the prop.
      await type(row(wrapper, 'Width').find('input'), '250')
      expect(props('f_customer').width).toBeUndefined()
    })

    it('updates weight, alignment and visibility', async () => {
      const wrapper = mountWith('f_customer')
      await row(wrapper, 'Font Weight').find('select').setValue('bold')
      await row(wrapper, 'Text Align').find('button[aria-label="right"]').trigger('click')
      await row(wrapper, 'Visibility').find('select').setValue('hidden')
      expect(props('f_customer')).toMatchObject({ bold: true, align: 'right', hidden: true })
    })

    it('accepts a valid color and ignores an invalid one', async () => {
      const wrapper = mountWith('f_customer')
      const input = () => row(wrapper, 'Color').find('input[type="text"]')
      await type(input(), '#ff0000')
      expect(props('f_customer').color).toBe('#ff0000')
      await type(input(), '#12345')
      expect(props('f_customer').color).toBe('#ff0000')
      expect(input().element.value).toBe('#ff0000')
    })

    it('stores the Depends On condition', async () => {
      const wrapper = mountWith('f_customer')
      await type(row(wrapper, 'Depends On').find('textarea'), "doc.customer != ''")
      expect(props('f_customer').condition).toBe("doc.customer != ''")
    })

    it('each edit is one undo step and marks the format unsaved', async () => {
      const wrapper = mountWith('f_customer')
      expect(store.isDirty).toBe(false)
      await type(row(wrapper, 'Label').find('input'), 'Bill To')
      expect(store.isDirty).toBe(true)
      designer.undo()
      expect(props('f_customer').label).toBeUndefined()
    })

    it('edits the format title when nothing is selected', async () => {
      const wrapper = mountWith(null)
      expect(wrapper.text()).toContain('Nothing selected')
      await type(row(wrapper, 'Format Title').find('input'), 'New Title')
      expect(store.currentSPF.title).toBe('New Title')
    })
  })
})

describe('smartPrintStore', () => {
  const savedDoc = (extra = {}) => ({
    name: 'SPF-00001',
    title: 'Invoice',
    target_doctype: 'Sales Invoice',
    version: 2,
    layout_json: sampleLayout(),
    ...extra,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    store.newSPF({ name: 'SPF-00001', target_doctype: 'Sales Invoice' }, sampleLayout())
  })

  describe('isDirty', () => {
    it('is false for a freshly opened format', () => {
      expect(store.isDirty).toBe(false)
    })

    it.each([
      ['addSection', () => designer.addSection()],
      ['addField', () => designer.addField({ fieldname: 'customer' }, { columnId: 'c2' })],
      ['moveNode', () => designer.moveNode('f_date', 'c2', 0)],
      ['deleteNode', () => designer.deleteNode('f_date')],
      ['updateProps', () => designer.updateProps('f_date', { bold: true })],
      ['undo', () => designer.undo()],
      ['setFields', () => store.setFields({ title: 'x' })],
      ['setTargetDoctype', () => store.setTargetDoctype('Purchase Order')],
    ])('is set by %s', (_name, change) => {
      if (_name === 'undo') {
        designer.updateProps('f_date', { bold: true })
        store.isDirty = false
      }
      change()
      expect(store.isDirty).toBe(true)
    })

    it('is not set by selecting a node or choosing the same DocType', () => {
      designer.selectNode('f_date')
      store.setTargetDoctype('Sales Invoice')
      expect(store.isDirty).toBe(false)
    })

    it('is cleared by a successful save, and kept when saving fails', async () => {
      designer.updateProps('f_date', { bold: true })
      api.saveSmartPrintFormat.mockResolvedValueOnce(savedDoc())
      await store.save()
      expect(store.isDirty).toBe(false)
      expect(store.currentSPF.version).toBe(2)
      expect(store.currentSPF.layout_json).toBeUndefined()

      designer.updateProps('f_date', { bold: false })
      api.saveSmartPrintFormat.mockRejectedValueOnce(new Error('Server down'))
      await store.save()
      expect(store.isDirty).toBe(true)
      expect(store.status).toBe('error')
      expect(store.error).toBe('Server down')
    })

    it('is cleared when a format is loaded', async () => {
      designer.updateProps('f_date', { bold: true })
      api.getSmartPrintFormat.mockResolvedValueOnce(savedDoc())
      await store.load('SPF-00001')
      expect(store.isDirty).toBe(false)
      expect(designer.canUndo.value).toBe(false)
    })
  })

  describe('save and publish through the designer', () => {
    it('does not save an invalid layout', async () => {
      api.validateLayoutOnServer.mockResolvedValueOnce({
        valid: false,
        errors: [{ node_id: 'f_date', message: 'Bad field', severity: 'error' }],
        warnings: [],
      })
      expect(await designer.save()).toBe(false)
      expect(api.saveSmartPrintFormat).not.toHaveBeenCalled()
      expect(designer.validation.value.errors[0]).toMatchObject({
        nodeId: 'f_date',
        location: 'Section 2 › Column 1 › Field 2',
      })
      expect([...designer.invalidIds.value]).toEqual(['f_date'])
    })

    it('saves a valid layout', async () => {
      designer.updateProps('f_date', { bold: true })
      api.validateLayoutOnServer.mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })
      api.saveSmartPrintFormat.mockResolvedValueOnce(savedDoc())
      expect(await designer.save()).toBe(true)
      expect(api.saveSmartPrintFormat.mock.calls[0][0]).toMatchObject({
        name: 'SPF-00001',
        target_doctype: 'Sales Invoice',
        layout_json: store.layoutJson,
      })
    })

    it('saves unsaved changes before publishing', async () => {
      designer.updateProps('f_date', { bold: true })
      api.validateLayoutOnServer.mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })
      api.saveSmartPrintFormat.mockResolvedValueOnce(savedDoc())
      api.publishSmartPrintFormat.mockResolvedValueOnce(savedDoc({ status: 'Active' }))
      expect(await designer.publish('First release')).toEqual({ ok: true })
      expect(api.saveSmartPrintFormat).toHaveBeenCalledOnce()
      expect(api.saveSmartPrintFormat.mock.calls[0][0].change_summary).toBe('First release')
      expect(api.publishSmartPrintFormat).toHaveBeenCalledWith('SPF-00001', { changeSummary: 'First release' })
      expect(store.currentSPF.status).toBe('Active')
    })

    it('validates locally when there is no DocType', async () => {
      store.newSPF({}, sampleLayout())
      const result = await designer.validate()
      expect(result.valid).toBe(false)
      expect(result.errors[0].message).toBe('Select a DocType first.')
      expect(api.validateLayoutOnServer).not.toHaveBeenCalled()
    })
  })
})
