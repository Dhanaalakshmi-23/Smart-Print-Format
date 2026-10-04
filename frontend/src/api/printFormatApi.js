import { getDoc, getMethod } from './frappeApi'

const DOCTYPE = 'Print Format'

export async function getPrintFormats({ doctype } = {}) {
  if (!doctype) return []
  return getMethod('smart_print_format.api.get_print_formats', { doctype })
}

export function getPrintFormat(name) {
  return getDoc(DOCTYPE, name)
}
