// Frappe's built-in "Print Format" DocType.

import { getDoc, getList, insertDoc, updateDoc } from './frappeApi'

const DOCTYPE = 'Print Format'

const LIST_FIELDS = [
  'name',
  'doc_type',
  'module',
  'standard',
  'custom_format',
  'print_format_type',
  'disabled',
  'modified',
]

// Print Formats, optionally limited to one target DocType.
export function getPrintFormats({ doctype, includeDisabled = false, limit = 0 } = {}) {
  const filters = []
  if (doctype) filters.push(['doc_type', '=', doctype])
  if (!includeDisabled) filters.push(['disabled', '=', 0])

  return getList(DOCTYPE, { fields: LIST_FIELDS, filters, orderBy: 'name asc', limit })
}

export function getPrintFormat(name) {
  return getDoc(DOCTYPE, name)
}

// Print Format names are user-chosen, so a new one needs `name` in `values`.
export function createPrintFormat(values) {
  return insertDoc(DOCTYPE, values)
}

// Save changes to an existing Print Format (e.g. generated html/css).
export function savePrintFormat(name, values) {
  return updateDoc(DOCTYPE, name, values)
}
