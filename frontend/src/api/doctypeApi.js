import { getMethod } from './frappeApi'

const API = 'smart_print_format.api'

export function getDocTypes() {
  return getMethod(`${API}.get_doctypes`)
}

export async function getDocTypeMeta(doctype) {
  const { meta, childTables } = await getMethod(`${API}.get_doctype_metadata`, { doctype })
  return { meta: meta || null, childTables: childTables || {} }
}
