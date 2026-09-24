// Look up field information in DocType metadata.
//
// `meta` is a DocType meta (useDoctypeMeta().meta.value) and `getChildMeta`
// is useDoctypeMeta().getChildMeta, used for child-table paths like
// "items.item_code".

// Fields every document has, which aren't listed in meta.fields.
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

// "customer_name" -> "Customer Name"
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

// Resolve "customer" or "items.item_code" to its docfield.
// Returns null if the field (or its table) doesn't exist.
//
//   { path, fieldname, label, fieldtype, options, table, docfield }
//
// `table` is the parent table fieldname for child-table paths, else null.
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

// Label for a path, falling back to a readable version of the fieldname
// when the field isn't in the metadata.
export function resolveLabel(path, meta, getChildMeta) {
  return resolveField(path, meta, getChildMeta)?.label || labelFromFieldname(path?.split('.').pop())
}

// Columns to show for a child table: the fields marked "In List View",
// or the first few value fields if none are marked.
export function getTableColumns(childMeta, { max = 5 } = {}) {
  const fields = (childMeta?.fields || []).filter(
    (df) => !['Section Break', 'Column Break', 'Tab Break', 'Button'].includes(df.fieldtype),
  )
  const listView = fields.filter((df) => df.in_list_view)
  return (listView.length ? listView : fields).slice(0, max)
}
