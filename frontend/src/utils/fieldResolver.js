export const STANDARD_FIELDS = [
  { fieldname: 'name', label: 'ID', fieldtype: 'Data' },
  { fieldname: 'owner', label: 'Created By', fieldtype: 'Link', options: 'User' },
  { fieldname: 'creation', label: 'Created On', fieldtype: 'Datetime' },
  { fieldname: 'modified', label: 'Last Updated On', fieldtype: 'Datetime' },
  { fieldname: 'modified_by', label: 'Last Updated By', fieldtype: 'Link', options: 'User' },
  { fieldname: 'docstatus', label: 'Document Status', fieldtype: 'Int' },
  { fieldname: 'idx', label: 'Index', fieldtype: 'Int' },
]

export const TABLE_FIELDTYPES = ['Table', 'Table MultiSelect']

export const isTableField = (docfield) => TABLE_FIELDTYPES.includes(docfield?.fieldtype)

export function labelFromFieldname(fieldname = '') {
  return fieldname.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function findDocfield(meta, fieldname) {
  return (
    meta?.fields?.find((df) => df.fieldname === fieldname) ||
    STANDARD_FIELDS.find((df) => df.fieldname === fieldname) ||
    null
  )
}

export function resolveField(path, meta, getChildMeta) {
  if (!path || !meta) return null

  const [first, rest] = splitPath(path)
  let docfield = findDocfield(meta, first)
  let table = null

  if (rest) {
    if (!isTableField(docfield) || !getChildMeta) return null
    table = first
    docfield = findDocfield(getChildMeta(docfield.options), rest)
  }
  if (!docfield) return null

  return {
    path,
    fieldname: docfield.fieldname,
    label: docfield.label || labelFromFieldname(docfield.fieldname),
    fieldtype: docfield.fieldtype,
    options: docfield.options || '',
    table,
    docfield,
  }
}

function splitPath(path) {
  const dot = path.indexOf('.')
  return dot === -1 ? [path, null] : [path.slice(0, dot), path.slice(dot + 1)]
}

export function resolveLabel(path, meta, getChildMeta) {
  return resolveField(path, meta, getChildMeta)?.label || labelFromFieldname(path?.split('.').pop())
}

export function getTableColumns(childMeta, { max = 5 } = {}) {
  const fields = (childMeta?.fields || []).filter(
    (df) =>
      !['Section Break', 'Column Break', 'Tab Break', 'Button', ...TABLE_FIELDTYPES].includes(df.fieldtype) &&
      !df.print_hide,
  )
  const listView = fields.filter((df) => df.in_list_view)
  return listView.length ? listView : fields.slice(0, max)
}

export function tableSettings(node, childMeta) {
  const props = node?.props || {}
  const configured = props.columns?.length ? props.columns : node?.table?.columns
  const columns = configured?.length
    ? configured.map((column) => {
        const df = findDocfield(childMeta, column.fieldname)
        return {
          fieldname: column.fieldname,
          label: column.label || df?.label || labelFromFieldname(column.fieldname),
          width: column.width ?? null,
          df,
        }
      })
    : getTableColumns(childMeta).map((df) => ({
        fieldname: df.fieldname,
        label: df.label || labelFromFieldname(df.fieldname),
        width: null,
        df,
      }))
  return {
    columns,
    configured: Boolean(configured?.length),
    showHeader: props.showHeader !== false,
    showTotal: Boolean(props.showTotal),
    totalField: props.totalField || null,
  }
}

export const columnWidthTotal = (columns = []) =>
  columns.reduce((sum, column) => sum + (Number(column.width) || 0), 0)
