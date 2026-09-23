// DocType discovery: which DocTypes exist and what fields they have.

import { getList, request } from './frappeApi'

// Regular (printable) DocTypes. Child tables and singles are excluded by
// default because a print format always targets a standalone document.
export function getDocTypes({
  search = '',
  includeChildTables = false,
  includeSingles = false,
  limit = 0,
} = {}) {
  const filters = []
  if (!includeChildTables) filters.push(['istable', '=', 0])
  if (!includeSingles) filters.push(['issingle', '=', 0])
  if (search) filters.push(['name', 'like', `%${search}%`])

  return getList('DocType', {
    fields: ['name', 'module', 'custom', 'istable', 'issingle'],
    filters,
    orderBy: 'name asc',
    limit,
  })
}

// Full metadata (fields, labels, fieldtypes, ...) for a DocType.
// Frappe returns the DocType together with the metas of its child tables,
// which the builder needs to render table fields like "items".
// Note: getdoctype returns its result in `docs`, not `message`, so we use
// the raw `request` helper instead of `callMethod`.
export async function getDocTypeMeta(doctype) {
  const body = await request('GET', '/method/frappe.desk.form.load.getdoctype', {
    params: { doctype },
  })
  const docs = body.docs || []
  const meta = docs.find((doc) => doc.name === doctype) || null
  const childTables = Object.fromEntries(
    docs.filter((doc) => doc.name !== doctype).map((doc) => [doc.name, doc]),
  )
  return { meta, childTables }
}
