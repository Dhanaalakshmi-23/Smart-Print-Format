// Reactive access to a DocType's metadata (fields, child tables, links).
//
// Metadata is cached per DocType for the whole frontend session, so every
// component asking for "Sales Invoice" shares one request and one result.

import { computed, ref, shallowRef, toValue, watch } from 'vue'
import { getDocTypeMeta } from '@/api/doctypeApi'

// Field types that only shape the form layout and never hold a value.
const LAYOUT_FIELDTYPES = ['Section Break', 'Column Break', 'Tab Break', 'Fold', 'Button']
const TABLE_FIELDTYPES = ['Table', 'Table MultiSelect']
const LINK_FIELDTYPES = ['Link', 'Dynamic Link']

// doctype -> Promise<{ meta, childTables }>
// Storing the promise (not the result) means concurrent callers share the
// same in-flight request instead of each starting their own.
const cache = new Map()

function fetchMeta(doctype) {
  if (!cache.has(doctype)) {
    const promise = getDocTypeMeta(doctype).then((bundle) => {
      if (!bundle.meta) throw new Error(`DocType '${doctype}' not found.`)
      // Child metas arrive with the parent; cache them so asking for a
      // child DocType directly doesn't trigger another request.
      Object.entries(bundle.childTables).forEach(([name, meta]) => {
        if (!cache.has(name)) cache.set(name, Promise.resolve({ meta, childTables: {} }))
      })
      return bundle
    })
    // Don't cache failures, so a later call can retry.
    promise.catch(() => cache.delete(doctype))
    cache.set(doctype, promise)
  }
  return cache.get(doctype)
}

export function clearDoctypeMetaCache() {
  cache.clear()
}

// `doctype` can be a plain string, a ref, or a getter (() => store.targetDoctype).
// When it changes, the metadata for the new DocType is loaded automatically.
export function useDoctypeMeta(doctype) {
  const meta = shallowRef(null)
  const childTables = shallowRef({})
  const loading = ref(false)
  const error = ref(null)

  // Guards against an older, slower request overwriting a newer one.
  let requestId = 0

  async function load(dt) {
    const id = ++requestId
    meta.value = null
    childTables.value = {}
    error.value = null

    if (!dt) {
      loading.value = false
      return
    }

    loading.value = true
    try {
      const bundle = await fetchMeta(dt)
      if (id !== requestId) return
      meta.value = bundle.meta
      childTables.value = bundle.childTables
    } catch (err) {
      if (id !== requestId) return
      error.value = err.message
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  const allFields = computed(() => meta.value?.fields || [])

  const fields = computed(() =>
    allFields.value.filter((df) => !LAYOUT_FIELDTYPES.includes(df.fieldtype)),
  )
  const tableFields = computed(() =>
    allFields.value.filter((df) => TABLE_FIELDTYPES.includes(df.fieldtype)),
  )
  const linkFields = computed(() =>
    allFields.value.filter((df) => LINK_FIELDTYPES.includes(df.fieldtype)),
  )

  // Meta of a child table DocType, e.g. getChildMeta('Sales Invoice Item').
  function getChildMeta(dt) {
    return childTables.value[dt] || null
  }

  // Force a fresh fetch, e.g. after the DocType was customized.
  function reload() {
    const dt = toValue(doctype)
    cache.delete(dt)
    return load(dt)
  }

  watch(() => toValue(doctype), load, { immediate: true })

  return {
    meta,
    fields,
    tableFields,
    linkFields,
    loading,
    error,
    getChildMeta,
    reload,
  }
}
