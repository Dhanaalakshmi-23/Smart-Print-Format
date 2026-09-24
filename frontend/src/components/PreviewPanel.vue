<script setup>
// Read-only, print-style preview of the current layout, built with
// generatePreview() from htmlGenerator.js. Only an approximation of the
// printed page: real output is still rendered by Frappe's Print Format.
//
// The HTML is shown in a sandboxed <iframe>, so the preview's CSS and the
// designer's CSS can't affect each other, and nothing in it is editable.
//
// It updates automatically shortly after each layout change, or only when
// "Refresh" is clicked if auto-update is turned off.
//
// Usage:
//   <PreviewPanel />                         the layout being edited
//   <PreviewPanel :layout="version.layout" /> any other layout, e.g. a saved version

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { generatePreview } from '@/utils/htmlGenerator'

const AUTO_UPDATE_DELAY = 300 // ms after the last change

const props = defineProps({
  layout: { type: Object, default: null },
})

const store = useSmartPrintStore()
const layout = computed(() => props.layout || store.layoutJson)
const { meta, getChildMeta, loading: metaLoading } = useDoctypeMeta(() => store.targetDoctype)

const placeholders = ref('jinja') // 'jinja' | 'fieldname'
const autoUpdate = ref(true)
const html = ref('')
const updatedAt = ref(null)
const isStale = ref(false)

// A4 page with 15mm margins, always paper-white like the printed page.
const PAGE_CSS = `
@page { size: A4; margin: 15mm; }
html { background: #fff; }
body { margin: 0; padding: 15mm; box-sizing: border-box; min-height: 297mm; }
@media print { body { padding: 0; min-height: 0; } }
.spf-empty { color: #8d99a6; text-align: center; margin-top: 40mm; }
`

function render() {
  const { html: body, css } = generatePreview(layout.value, {
    meta: meta.value,
    getChildMeta,
    placeholders: placeholders.value,
  })
  const content = layout.value.sections?.length
    ? body
    : '<p class="spf-empty">The layout is empty. Add sections on the canvas to preview them.</p>'
  // generatePreview escapes every value from the layout, so this is safe.
  html.value = `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}${css}</style></head><body>${content}</body></html>`
  updatedAt.value = new Date()
  isStale.value = false
}

// ---- Updating ----

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

// Every designer change replaces layoutJson with a new object (see
// useDesigner's commit), so a shallow watch sees each edit and undo.
watch([layout, meta], scheduleRender)
// Settings apply at once; turning auto-update back on catches up.
watch(placeholders, refresh)
watch(autoUpdate, (on) => on && isStale.value && refresh())

onBeforeUnmount(() => clearTimeout(timer))
render()

const updatedLabel = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { timeStyle: 'medium' }) : '',
)

// ---- Page height ----

// The iframe doesn't grow with its content by itself. The sandbox allows
// same-origin access (but no scripts), so we can read the content height.
const frame = ref(null)
const frameHeight = ref(null)

function fitToContent() {
  // body, not documentElement: the document is never shorter than the
  // frame, so its height could only ever grow.
  const body = frame.value?.contentDocument?.body
  if (body) frameHeight.value = body.offsetHeight
}
</script>

<template>
  <section class="preview" aria-label="Print preview">
    <header class="preview__bar">
      <div class="preview__segments" role="radiogroup" aria-label="Field placeholders">
        <button
          type="button"
          role="radio"
          :aria-checked="placeholders === 'jinja'"
          :class="{ 'is-active': placeholders === 'jinja' }"
          @click="placeholders = 'jinja'"
        >
          Jinja
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="placeholders === 'fieldname'"
          :class="{ 'is-active': placeholders === 'fieldname' }"
          @click="placeholders = 'fieldname'"
        >
          Field names
        </button>
      </div>

      <label class="preview__check">
        <input v-model="autoUpdate" type="checkbox" />
        Auto-update
      </label>

      <span class="preview__status" aria-live="polite">
        <template v-if="metaLoading">Loading DocType…</template>
        <template v-else-if="isStale && !autoUpdate">Layout changed — refresh to update</template>
        <template v-else-if="updatedLabel">Updated {{ updatedLabel }}</template>
      </span>

      <button type="button" class="preview__refresh" @click="refresh">Refresh</button>
    </header>

    <p class="preview__note">
      Approximate preview. The printed document is rendered by Frappe's Print Format.
    </p>

    <iframe
      ref="frame"
      class="preview__page"
      title="Print preview"
      sandbox="allow-same-origin"
      :srcdoc="html"
      :style="frameHeight ? { height: `${frameHeight}px` } : null"
      @load="fitToContent"
    />
  </section>
</template>

<style scoped>
.preview {
  min-height: 100%;
  box-sizing: border-box;
  padding: 16px 24px 24px;
  background: var(--code-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.preview__bar {
  width: 210mm;
  max-width: 100%;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.preview__status {
  flex: 1;
  color: var(--text);
  font-size: 12px;
}

.preview__check {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}

.preview__refresh:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.preview__segments {
  display: flex;
}

.preview__segments button {
  border-radius: 0;
}

.preview__segments button:first-child {
  border-radius: 6px 0 0 6px;
}

.preview__segments button:last-child {
  border-radius: 0 6px 6px 0;
}

.preview__segments button + button {
  border-left: none;
}

.preview__segments button.is-active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.preview__note {
  width: 210mm;
  max-width: 100%;
  margin: 0;
  font-size: 11px;
  color: var(--text);
}

.preview__page {
  flex-shrink: 0;
  width: 210mm;
  height: 297mm;
  border: none;
  background: #fff;
  box-shadow: var(--shadow);
}
</style>
