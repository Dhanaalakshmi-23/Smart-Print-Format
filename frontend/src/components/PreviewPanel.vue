<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { usePreview } from '@/composables/usePreview'
import { previewPrint, searchDocuments } from '@/api/smartPrintApi'
import SearchSelect from './SearchSelect.vue'

const props = defineProps({
  layout: { type: Object, default: null },
})

const store = useSmartPrintStore()
const currentLayout = () => props.layout || store.layoutJson
const { html, refresh, autoUpdate, placeholders, isStale, updatedAt, metaLoading } = usePreview(
  currentLayout,
  () => store.targetDoctype,
)

const mode = ref('live')

const updatedLabel = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { timeStyle: 'medium' }) : '',
)

const docname = ref('')
const docOptions = ref([])
const docLoading = ref(false)
const docError = ref(null)
let searchTimer = null
let searchId = 0

function searchDocs(txt) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (!store.targetDoctype) return
    const id = ++searchId
    docLoading.value = true
    docError.value = null
    try {
      const rows = await searchDocuments(store.targetDoctype, txt)
      if (id !== searchId) return
      docOptions.value = rows.map((row) => ({
        value: row.name,
        label: row.name,
        hint: row.title && row.title !== row.name ? row.title : '',
      }))
    } catch (err) {
      if (id === searchId) docError.value = `Could not load documents: ${err.message}`
    } finally {
      if (id === searchId) docLoading.value = false
    }
  }, 250)
}

const serverHtml = ref('')
const serverLoading = ref(false)
const serverError = ref(null)
const serverStale = ref(false)
const serverWarnings = ref([])
let renderId = 0

async function renderServer() {
  if (!docname.value || !store.targetDoctype) return
  const id = ++renderId
  serverLoading.value = true
  serverError.value = null
  try {
    const result = await previewPrint({
      name: store.currentSPF?.name,
      docname: docname.value,
      layout: currentLayout(),
      targetDoctype: store.targetDoctype,
    })
    if (id !== renderId) return
    serverHtml.value = result.html
    serverWarnings.value = result.warnings || []
    serverStale.value = false
  } catch (err) {
    if (id === renderId) serverError.value = err.message
  } finally {
    if (id === renderId) serverLoading.value = false
  }
}

watch(docname, renderServer)

watch(
  () => store.targetDoctype,
  () => {
    docname.value = ''
    docOptions.value = []
    serverHtml.value = ''
  },
)

watch(currentLayout, () => {
  if (serverHtml.value) serverStale.value = true
})

function onRefresh() {
  if (mode.value === 'server') renderServer()
  else refresh()
}

onBeforeUnmount(() => clearTimeout(searchTimer))

const frameHeight = ref(null)

function fitToContent(event) {
  const body = event.target?.contentDocument?.body
  if (body) frameHeight.value = Math.max(body.scrollHeight, 200)
}
</script>

<template>
  <section class="preview" aria-label="Print preview">
    <header class="preview__bar">
      <div class="preview__segments" role="radiogroup" aria-label="Preview mode">
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'live'"
          :class="{ 'is-active': mode === 'live' }"
          @click="mode = 'live'"
        >
          Live
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'server'"
          :class="{ 'is-active': mode === 'server' }"
          @click="mode = 'server'"
        >
          Server
        </button>
      </div>

      <template v-if="mode === 'live'">
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
      </template>

      <template v-else>
        <SearchSelect
          v-model="docname"
          class="preview__doc"
          remote
          :options="docOptions"
          :loading="docLoading"
          :error="docError"
          :disabled="!store.targetDoctype"
          :empty-text="`No ${store.targetDoctype || 'documents'} found`"
          :label="`${store.targetDoctype || 'Document'} to preview`"
          :placeholder="store.targetDoctype ? `Select a ${store.targetDoctype}` : 'Select a DocType first'"
          @search="searchDocs"
        />
        <span class="preview__status" aria-live="polite">
          <template v-if="serverLoading">Rendering on the server…</template>
          <template v-else-if="serverStale">Layout changed — refresh to update</template>
          <template v-else-if="serverHtml">Rendered by the server</template>
        </span>
      </template>

      <button
        type="button"
        class="preview__refresh"
        :disabled="mode === 'server' && (!docname || serverLoading)"
        @click="onRefresh"
      >
        Refresh
      </button>
    </header>

    <template v-if="mode === 'live'">
      <p class="preview__note">
        Live preview with placeholders. Use “Server” to print a real document exactly as Frappe will.
      </p>
      <iframe
        class="preview__page"
        title="Print preview"
        sandbox="allow-same-origin"
        :srcdoc="html"
        :style="frameHeight ? { height: `${frameHeight}px` } : null"
        @load="fitToContent"
      />
    </template>

    <template v-else>
      <p v-if="!store.targetDoctype" class="preview__note">Select a DocType first.</p>
      <p v-else-if="serverError" class="preview__note is-error" role="alert">
        {{ serverError }}
        <button type="button" class="preview__retry" @click="renderServer">Retry</button>
      </p>
      <p v-else-if="!docname" class="preview__note">
        Pick a {{ store.targetDoctype }} to render it with the current layout (unsaved changes included).
      </p>
      <p v-else-if="serverWarnings.length" class="preview__note is-warning">
        {{ serverWarnings.length }} warning(s): {{ serverWarnings.map((w) => w.message).join(' · ') }}
      </p>

      <div v-if="serverLoading && !serverHtml" class="preview__loading">Rendering {{ docname }}…</div>
      <iframe
        v-else-if="serverHtml && docname"
        class="preview__page"
        :class="{ 'is-busy': serverLoading }"
        :title="`Server preview of ${docname}`"
        sandbox="allow-same-origin"
        :srcdoc="serverHtml"
        :style="frameHeight ? { height: `${frameHeight}px` } : null"
        @load="fitToContent"
      />
    </template>
  </section>
</template>

<style scoped>
.preview {
  min-height: 100%;
  box-sizing: border-box;
  padding: 16px 24px 24px;
  background: var(--input);
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
  color: var(--muted);
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
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}

.preview__refresh:hover {
  border-color: var(--blue);
  background: var(--blue-bg);
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
  border-color: var(--blue);
  background: var(--blue-bg);
}

.preview__note {
  width: 210mm;
  max-width: 100%;
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.preview__page {
  flex-shrink: 0;
  width: 210mm;
  max-width: 100%;
  height: 297mm;
  border: none;
  background: #fff;
  box-shadow: var(--shadow);
}

.preview__page.is-busy {
  opacity: 0.6;
}

.preview__note.is-error {
  color: var(--red);
}

.preview__note.is-warning {
  color: var(--orange);
}

.preview__retry {
  margin-left: 8px;
  padding: 1px 8px;
  font-size: 11px;
}

.preview__loading {
  width: 210mm;
  max-width: 100%;
  padding: 60px 0;
  text-align: center;
  color: var(--muted);
  background: var(--panel);
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
}

.preview__doc :deep(.select__button) {
  width: 200px;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
