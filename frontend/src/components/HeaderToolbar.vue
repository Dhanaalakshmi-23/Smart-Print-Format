<script setup>
// Top bar of the designer: document settings (title, DocType, Print Format)
// and the main actions (undo/redo, validate, preview, save, publish).
//
// Usage:
//   <HeaderToolbar v-model:preview="showPreview" @validate="onValidate" />
//
// - v-model:preview   the parent decides what "preview mode" shows
// - @validate(result) result of validateLayout(), for showing the error list

import { computed, onMounted, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { getDocTypes } from '@/api/doctypeApi'
import { getPrintFormats } from '@/api/printFormatApi'
import { validateLayout } from '@/utils/validation'

const preview = defineModel('preview', { type: Boolean, default: false })
const emit = defineEmits(['validate'])

const store = useSmartPrintStore()
const { undo, redo, canUndo, canRedo } = useDesigner()
const { meta, getChildMeta } = useDoctypeMeta(() => store.targetDoctype)

// ---- Document settings ----

const title = computed({
  get: () => store.currentSPF?.title || '',
  set: (value) => store.setFields({ title: value }),
})

const doctypes = ref([])
const doctypeInput = ref(store.targetDoctype || '')
const printFormats = ref([])
const optionsError = ref(null)

onMounted(async () => {
  try {
    doctypes.value = await getDocTypes()
  } catch (err) {
    optionsError.value = `Could not load DocTypes: ${err.message}`
  }
})

// Keep the input in sync when a different document is loaded.
watch(
  () => store.targetDoctype,
  (doctype) => (doctypeInput.value = doctype || ''),
)

// The input allows typing to search; only accept names that really exist.
function onDoctypeChange() {
  const doctype = doctypeInput.value.trim()
  const exists = doctypes.value.some((dt) => dt.name === doctype)
  const layoutHasContent = store.layoutJson.sections.length > 0

  if (
    !exists ||
    doctype === store.targetDoctype ||
    (layoutHasContent &&
      !window.confirm('Changing the DocType can make fields in the current layout invalid. Continue?'))
  ) {
    doctypeInput.value = store.targetDoctype || ''
    return
  }

  store.setTargetDoctype(doctype)
  // A Print Format belongs to one DocType, so the old choice no longer fits.
  store.setFields({ print_format: null })
}

// Reload the Print Format options whenever the DocType changes.
let printFormatRequest = 0
watch(
  () => store.targetDoctype,
  async (doctype) => {
    const id = ++printFormatRequest
    printFormats.value = []
    if (!doctype) return
    try {
      const result = await getPrintFormats({ doctype })
      if (id === printFormatRequest) printFormats.value = result
    } catch (err) {
      if (id === printFormatRequest) optionsError.value = `Could not load Print Formats: ${err.message}`
    }
  },
  { immediate: true },
)

const printFormat = computed({
  get: () => store.currentSPF?.print_format || '',
  set: (value) => store.setFields({ print_format: value || null }),
})

// ---- Actions ----

const validation = ref(null)

// Every edit replaces the layout object, so an old result is out of date.
watch(
  () => store.layoutJson,
  () => (validation.value = null),
)

function runValidation() {
  const result = validateLayout(store.layoutJson, { meta: meta.value, getChildMeta })
  validation.value = result
  emit('validate', result)
  return result
}

async function onSave() {
  if (!runValidation().valid) return
  await store.save()
}

async function onPublish() {
  if (!runValidation().valid) return
  const changeSummary = window.prompt('Describe this version (optional):', '')
  if (changeSummary === null) return // cancelled
  await store.publish({ changeSummary })
}

// ---- Status line ----

const statusText = computed(() => {
  if (optionsError.value) return { tone: 'error', text: optionsError.value }
  if (store.status === 'error') return { tone: 'error', text: store.error }
  if (store.status === 'loading') return { tone: 'muted', text: 'Loading…' }
  if (store.status === 'saving') return { tone: 'muted', text: 'Saving…' }
  if (store.status === 'publishing') return { tone: 'muted', text: 'Publishing…' }
  if (validation.value && !validation.value.valid) {
    const count = validation.value.errors.length
    return { tone: 'error', text: `${count} validation error${count === 1 ? '' : 's'}` }
  }
  if (store.isDirty) return { tone: 'warning', text: 'Unsaved changes' }
  if (store.isNew) return { tone: 'muted', text: 'Not saved yet' }
  return { tone: 'muted', text: `Saved · ${store.currentSPF?.status || 'Draft'} · v${store.currentSPF?.version ?? 1}` }
})
</script>

<template>
  <header class="toolbar">
    <div class="toolbar__settings">
      <input
        v-model="title"
        class="toolbar__title"
        type="text"
        placeholder="Untitled Smart Print Format"
        aria-label="Smart Print Format title"
      />

      <label class="toolbar__field">
        <span>DocType</span>
        <input
          v-model="doctypeInput"
          list="toolbar-doctypes"
          type="text"
          placeholder="Select DocType"
          :disabled="store.isBusy"
          @change="onDoctypeChange"
        />
        <datalist id="toolbar-doctypes">
          <option v-for="dt in doctypes" :key="dt.name" :value="dt.name" />
        </datalist>
      </label>

      <label class="toolbar__field">
        <span>Print Format</span>
        <select v-model="printFormat" :disabled="!store.targetDoctype || store.isBusy">
          <option value="">Select Print Format</option>
          <option v-for="pf in printFormats" :key="pf.name" :value="pf.name">{{ pf.name }}</option>
        </select>
      </label>
    </div>

    <div class="toolbar__actions">
      <div class="toolbar__group">
        <button type="button" title="Undo" :disabled="!canUndo || store.isBusy" @click="undo">
          ↶ Undo
        </button>
        <button type="button" title="Redo" :disabled="!canRedo || store.isBusy" @click="redo">
          ↷ Redo
        </button>
      </div>

      <div class="toolbar__group">
        <button type="button" @click="runValidation">Validate</button>
        <button
          type="button"
          :class="{ 'is-active': preview }"
          :aria-pressed="preview"
          @click="preview = !preview"
        >
          Preview
        </button>
      </div>

      <div class="toolbar__group">
        <button
          type="button"
          :disabled="store.isBusy || (!store.isDirty && !store.isNew)"
          @click="onSave"
        >
          Save
        </button>
        <button type="button" class="is-primary" :disabled="store.isBusy" @click="onPublish">
          Publish
        </button>
      </div>
    </div>

    <p class="toolbar__status" :class="`is-${statusText.tone}`" role="status">
      {{ statusText.text }}
    </p>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  font-size: 14px;
}

.toolbar__settings,
.toolbar__actions,
.toolbar__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.toolbar__settings {
  flex: 1 1 auto;
}

.toolbar__actions {
  gap: 16px;
}

.toolbar__title {
  min-width: 200px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-h);
  border-color: transparent;
}

.toolbar__title:hover,
.toolbar__title:focus {
  border-color: var(--border);
}

.toolbar__field {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar__field span {
  font-size: 12px;
}

input,
select,
button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
}

button {
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--accent-border);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

button.is-active {
  background: var(--accent-bg);
  border-color: var(--accent-border);
}

button.is-primary {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}

.toolbar__status {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
}

.toolbar__status.is-error {
  color: #d9383a;
}

.toolbar__status.is-warning {
  color: #c77c00;
}
</style>
