// Smart Print Format documents, their versions, and reusable components.
//
// The UI works with `layout_json` as a plain object; this module converts it
// to/from the JSON string stored in the database.

import { deleteDoc, getDoc, getList, insertDoc, updateDoc } from './frappeApi'

const DOCTYPE = 'Smart Print Format'
const VERSION_DOCTYPE = 'Smart Print Format Version'
const COMPONENT_DOCTYPE = 'Smart Print Format Component'

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

const VERSION_LIST_FIELDS = [
  'name',
  'version_number',
  'is_published',
  'change_summary',
  'created_by',
  'created_on',
]

// ---- layout_json conversion ----

function parseLayout(value) {
  if (!value || typeof value !== 'string') return value || null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function fromServer(doc) {
  return doc && { ...doc, layout_json: parseLayout(doc.layout_json) }
}

function toServer(values) {
  if (!values || values.layout_json == null || typeof values.layout_json === 'string') {
    return values
  }
  return { ...values, layout_json: JSON.stringify(values.layout_json) }
}

// ---- Smart Print Format CRUD ----

export function getSmartPrintFormats({ filters, limit = 0 } = {}) {
  return getList(DOCTYPE, { fields: LIST_FIELDS, filters, orderBy: 'modified desc', limit })
}

export async function getSmartPrintFormat(name) {
  return fromServer(await getDoc(DOCTYPE, name))
}

export async function createSmartPrintFormat(values) {
  return fromServer(await insertDoc(DOCTYPE, toServer({ status: 'Draft', version: 1, ...values })))
}

export async function updateSmartPrintFormat(name, values) {
  return fromServer(await updateDoc(DOCTYPE, name, toServer(values)))
}

export function deleteSmartPrintFormat(name) {
  return deleteDoc(DOCTYPE, name)
}

// Names are auto-generated (SPF-#####), so a doc without a name is new.
export function saveSmartPrintFormat(doc) {
  const { name, ...values } = doc
  return name ? updateSmartPrintFormat(name, values) : createSmartPrintFormat(values)
}

// ---- Versions ----

export function getVersions(smartPrintFormat) {
  return getList(VERSION_DOCTYPE, {
    fields: VERSION_LIST_FIELDS,
    filters: [['smart_print_format', '=', smartPrintFormat]],
    orderBy: 'version_number desc',
    limit: 0,
  })
}

export async function getVersion(name) {
  return fromServer(await getDoc(VERSION_DOCTYPE, name))
}

export async function getPublishedVersion(smartPrintFormat) {
  const [version] = await getList(VERSION_DOCTYPE, {
    fields: VERSION_LIST_FIELDS,
    filters: [
      ['smart_print_format', '=', smartPrintFormat],
      ['is_published', '=', 1],
    ],
    limit: 1,
  })
  return version || null
}

async function getNextVersionNumber(smartPrintFormat) {
  const [latest] = await getList(VERSION_DOCTYPE, {
    fields: ['version_number'],
    filters: [['smart_print_format', '=', smartPrintFormat]],
    orderBy: 'version_number desc',
    limit: 1,
  })
  return (latest?.version_number || 0) + 1
}

// Snapshot the current content of a Smart Print Format as a new, immutable
// version. created_by / created_on are set by the server.
export async function createVersion(smartPrintFormat, { changeSummary = '' } = {}) {
  const doc = await getDoc(DOCTYPE, smartPrintFormat)
  const versionNumber = await getNextVersionNumber(smartPrintFormat)

  const version = await insertDoc(VERSION_DOCTYPE, {
    smart_print_format: smartPrintFormat,
    version_number: versionNumber,
    layout_json: doc.layout_json || JSON.stringify({ sections: [] }),
    generated_html: doc.generated_html,
    generated_css: doc.generated_css,
    change_summary: changeSummary,
    is_published: 0,
  })
  return fromServer(version)
}

// Copy a version's content back into its Smart Print Format as the working draft.
export async function restoreVersion(versionName) {
  const version = await getDoc(VERSION_DOCTYPE, versionName)
  return updateSmartPrintFormat(version.smart_print_format, {
    layout_json: version.layout_json,
    generated_html: version.generated_html,
    generated_css: version.generated_css,
  })
}

// ---- Publish ----

// Publishing = snapshot as a new version, make it the only published version,
// and mark the Smart Print Format active.
//
// This is several REST calls, not one transaction: if a later step fails the
// earlier ones stay saved. Steps are ordered so the previously published
// version is only unpublished after the new version was created successfully.
export async function publishSmartPrintFormat(name, { changeSummary = '' } = {}) {
  const version = await createVersion(name, { changeSummary })

  const previous = await getPublishedVersion(name)
  if (previous) {
    await updateDoc(VERSION_DOCTYPE, previous.name, { is_published: 0 })
  }
  await updateDoc(VERSION_DOCTYPE, version.name, { is_published: 1 })

  // Use the server-set version timestamps so publish info doesn't depend on
  // the browser's clock or timezone.
  return updateSmartPrintFormat(name, {
    status: 'Active',
    is_active: 1,
    version: version.version_number,
    last_published_on: version.created_on,
    last_published_by: version.created_by,
  })
}

// ---- Reusable components ----

const COMPONENT_LIST_FIELDS = [
  'name',
  'component_name',
  'component_type',
  'description',
  'configuration_json',
  'thumbnail_svg',
]

function parseConfiguration(value) {
  if (!value || typeof value !== 'string') return value || {}
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

// Active Smart Print Format Components, with configuration_json parsed.
export async function getActiveComponents() {
  const components = await getList(COMPONENT_DOCTYPE, {
    fields: COMPONENT_LIST_FIELDS,
    filters: [['is_active', '=', 1]],
    orderBy: 'component_name asc',
    limit: 0,
  })
  return components.map((component) => ({
    ...component,
    configuration_json: parseConfiguration(component.configuration_json),
  }))
}
