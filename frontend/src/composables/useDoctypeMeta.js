import { computed, ref, shallowRef, toValue, watch } from 'vue'
import { getDocTypeMeta, getDocTypes } from '@/api/doctypeApi'

const LAYOUT_FIELDTYPES = ['Section Break', 'Column Break', 'Tab Break', 'Fold', 'Button']
const TABLE_FIELDTYPES = ['Table', 'Table MultiSelect']

const cache = new Map()

function fetchMeta(doctype) {
  if (!cache.has(doctype)) {
    const promise = getDocTypeMeta(doctype).then((bundle) => {
      if (!bundle.meta) throw new Error(`DocType '${doctype}' not found.`)

      Object.entries(bundle.childTables).forEach(([name, meta]) => {
        if (!cache.has(name)) cache.set(name, Promise.resolve({ meta, childTables: {} }))
      })
      return bundle
    })

    promise.catch(() => cache.delete(doctype))
    cache.set(doctype, promise)
  }
  return cache.get(doctype)
}

export function useDoctypeMeta(doctype) {
  const meta = shallowRef(null)
  const childTables = shallowRef({})
  const loading = ref(false)
  const error = ref(null)

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
  function getChildMeta(dt) {
    return childTables.value[dt] || null
  }

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
    loading,
    error,
    getChildMeta,
    reload,
  }
}

const doctypeList = shallowRef([])
const doctypeListLoading = ref(false)
const doctypeListError = ref(null)
let doctypeListRequest = null

export function useDocTypeList() {
  function load({ refresh = false } = {}) {
    if (doctypeListRequest && !refresh) return doctypeListRequest
    doctypeListLoading.value = true
    doctypeListError.value = null
    doctypeListRequest = getDocTypes()
      .then((list) => (doctypeList.value = list))
      .catch((err) => {
        doctypeListError.value = `Could not load DocTypes: ${err.message}`
        doctypeListRequest = null
      })
      .finally(() => (doctypeListLoading.value = false))
    return doctypeListRequest
  }

  const has = (name) => doctypeList.value.some((dt) => dt.name === name)

  return { doctypes: doctypeList, loading: doctypeListLoading, error: doctypeListError, load, has }
}
