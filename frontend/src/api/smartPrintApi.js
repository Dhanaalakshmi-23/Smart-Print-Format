import { getList, getMethod, postMethod } from './frappeApi'
import { parseLayout, stringifyLayout } from '@/utils/layoutSerializer'

const DOCTYPE = 'Smart Print Format'
const API = 'smart_print_format.api'

const LIST_FIELDS = [
  'name',
  'title',
  'target_doctype',
  'print_format',
  'status',
  'version',
  'is_active',
  'last_published_on',
  'modified',
]

function fromServer(doc) {
  return doc && { ...doc, layout_json: parseLayout(doc.layout_json).layout }
}

export function getSmartPrintFormats({ filters, limit = 0 } = {}) {
  return getList(DOCTYPE, { fields: LIST_FIELDS, filters, orderBy: 'modified desc', limit })
}

export async function getSmartPrintFormat(name) {
  return fromServer(await getMethod(`${API}.get_smart_print_format`, { name }))
}

export async function createSmartPrintFormat(values) {
  return fromServer(
    await postMethod(`${API}.create_smart_print_format`, {
      title: values.title,
      target_doctype: values.target_doctype,
      print_format: values.print_format || null,
      description: values.description,
      layout_json: stringifyLayout(values.layout_json),
    }),
  )
}

export async function updateSmartPrintFormat(name, values) {
  return fromServer(
    await postMethod(`${API}.save_layout`, {
      name,
      layout_json: stringifyLayout(values.layout_json),
      change_summary: values.change_summary,
      title: values.title,
      print_format: values.print_format === undefined ? undefined : values.print_format || '',
      target_doctype: values.target_doctype,
      description: values.description,
    }),
  )
}

export function saveSmartPrintFormat(doc) {
  const { name, ...values } = doc
  return name ? updateSmartPrintFormat(name, values) : createSmartPrintFormat(values)
}

export function validateLayoutOnServer({ name, layout, targetDoctype } = {}) {
  return postMethod(`${API}.validate_layout`, {
    name: name || undefined,
    layout_json: stringifyLayout(layout),
    target_doctype: targetDoctype,
  })
}

export function previewPrint({ name, docname, layout, targetDoctype } = {}) {
  return postMethod(`${API}.preview_print`, {
    name: name || undefined,
    docname,
    layout_json: stringifyLayout(layout),
    target_doctype: targetDoctype,
  })
}

export function searchDocuments(doctype, txt = '', { limit = 20 } = {}) {
  return getMethod(`${API}.search_documents`, { doctype, txt: txt || undefined, limit })
}

export function getVersions(smartPrintFormat) {
  return getMethod(`${API}.get_versions`, { name: smartPrintFormat })
}

export async function getVersion(name) {
  return fromServer(await getMethod(`${API}.get_version`, { name }))
}

export async function restoreVersion(versionName) {
  const version = await getVersion(versionName)
  return fromServer(
    await postMethod(`${API}.restore_version`, {
      name: version.smart_print_format,
      version_number: version.version_number,
    }),
  )
}

export async function publishSmartPrintFormat(name, { changeSummary = '' } = {}) {
  return fromServer(
    await postMethod(`${API}.publish_print_format`, { name, change_summary: changeSummary }),
  )
}

export function getActiveComponents({ componentType } = {}) {
  return getMethod(`${API}.get_components`, { component_type: componentType })
}
