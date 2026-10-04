import { computed, ref, shallowRef, toValue, watch } from 'vue'
import { getPrintFormat, getPrintFormats } from '@/api/printFormatApi'

export function usePrintFormat(doctype, selectedName) {
  const printFormats = shallowRef([])
  const loading = ref(false)
  const error = ref(null)

  const selected = shallowRef(null)

  let listRequest = 0
  let selectedRequest = 0

  async function loadList(dt) {
    const id = ++listRequest
    printFormats.value = []
    error.value = null
    if (!dt) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const list = await getPrintFormats({ doctype: dt })
      if (id === listRequest) printFormats.value = list
    } catch (err) {
      if (id === listRequest) error.value = `Could not load Print Formats: ${err.message}`
    } finally {
      if (id === listRequest) loading.value = false
    }
  }

  async function loadSelected(name) {
    const id = ++selectedRequest
    selected.value = null
    if (!name) return
    try {
      const doc = await getPrintFormat(name)
      if (id === selectedRequest) selected.value = doc
    } catch {
      // A missing Print Format simply shows as not selected.
    }
  }

  watch(() => toValue(doctype), loadList, { immediate: true })
  watch(() => toValue(selectedName), loadSelected, { immediate: true })

  const belongsToDoctype = computed(
    () => !selected.value || selected.value.doc_type === toValue(doctype),
  )

  return {
    printFormats,
    loading,
    error,
    selected,
    belongsToDoctype,
  }
}
