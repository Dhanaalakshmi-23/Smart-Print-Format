import { onBeforeUnmount, ref, toValue, watch } from 'vue'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { generatePreview } from '@/utils/htmlGenerator'

const AUTO_UPDATE_DELAY = 300

const PAGE_CSS = `
@page { size: A4; margin: 15mm; }
html { background: #fff; }
body { margin: 0; padding: 15mm; box-sizing: border-box; min-height: 297mm; }
@media print { body { padding: 0; min-height: 0; } }
.spf-empty { color: #8d99a6; text-align: center; margin-top: 40mm; }
`

export function usePreview(layout, doctype) {
  const { meta, getChildMeta, loading: metaLoading } = useDoctypeMeta(doctype)

  const placeholders = ref('jinja')
  const autoUpdate = ref(true)
  const html = ref('')
  const updatedAt = ref(null)
  const isStale = ref(false)

  function render() {
    const current = toValue(layout)
    const { html: body, css } = generatePreview(current, {
      meta: meta.value,
      getChildMeta,
      placeholders: placeholders.value,
    })
    const content = current?.sections?.length
      ? body
      : '<p class="spf-empty">The layout is empty. Add sections on the canvas to preview them.</p>'

    html.value = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}${css}</style></head><body>${content}</body></html>`
    updatedAt.value = new Date()
    isStale.value = false
  }

  let timer = null

  function scheduleRender() {
    isStale.value = true
    if (!autoUpdate.value) return
    clearTimeout(timer)
    timer = setTimeout(render, AUTO_UPDATE_DELAY)
  }

  function refresh() {
    clearTimeout(timer)
    render()
  }

  watch([() => toValue(layout), meta], scheduleRender)

  watch(placeholders, refresh)
  watch(autoUpdate, (on) => on && isStale.value && refresh())

  onBeforeUnmount(() => clearTimeout(timer))
  render()

  return { html, refresh, autoUpdate, placeholders, isStale, updatedAt, metaLoading }
}
