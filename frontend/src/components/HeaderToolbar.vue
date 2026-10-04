<script setup>
import { computed, inject } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDocTypeList } from '@/composables/useDoctypeMeta'
import { createDefaultLayout, isDefaultLayout } from '@/utils/layout'
import SearchSelect from './SearchSelect.vue'

const preview = defineModel('preview', { type: Boolean, default: false })

const store = useSmartPrintStore()
const { undo, redo, canUndo, canRedo, openPublish, isWorking } = useDesigner()

const doctypeList = useDocTypeList()

const doctypeOptions = computed(() =>
  doctypeList.doctypes.value.map((dt) => ({ value: dt.name, label: dt.name, hint: dt.module })),
)

function onDoctypeChange(doctype) {
  const untouched = isDefaultLayout(store.layoutJson, store.targetDoctype)
  const layoutHasContent = store.layoutJson.sections.length > 0
  if (
    !untouched &&
    layoutHasContent &&
    !window.confirm('Changing the DocType can make fields in the current layout invalid. Continue?')
  ) {
    return
  }
  if (untouched) store.setLayout(createDefaultLayout(doctype))
  store.setTargetDoctype(doctype)

  store.setFields({ print_format: null })
}

const printFormat = inject('printFormat')

const printFormatOptions = computed(() =>
  printFormat.printFormats.value.map((pf) => ({
    value: pf.name,
    label: pf.name,
    hint: [pf.print_format_type, pf.standard === 'Yes' && 'standard'].filter(Boolean).join(' · '),
  })),
)

function onPrintFormatChange(name) {
  store.setFields({ print_format: name || null })
}
</script>

<template>
  <header class="toolbar">
    <RouterLink :to="{ name: 'dashboard' }" class="toolbar__brand" title="All Smart Print Formats">
      Smart Print Format
    </RouterLink>

    <div class="toolbar__field">
      <span>DocType:</span>
      <SearchSelect
        :model-value="store.targetDoctype || ''"
        :options="doctypeOptions"
        :loading="doctypeList.loading.value"
        :error="doctypeList.error.value"
        :disabled="store.isBusy"
        label="DocType"
        placeholder="Select DocType"
        tone="blue"
        @open="doctypeList.load()"
        @update:model-value="onDoctypeChange"
      />
    </div>

    <div class="toolbar__field">
      <span>Format:</span>
      <SearchSelect
        :model-value="store.currentSPF?.print_format || ''"
        :options="printFormatOptions"
        :loading="printFormat.loading.value"
        :error="printFormat.error.value"
        :disabled="!store.targetDoctype || store.isBusy"
        :invalid="!printFormat.belongsToDoctype.value"
        :empty-text="`No Print Formats for ${store.targetDoctype}`"
        label="Print Format"
        placeholder="Select Print Format"
        tone="orange"
        @update:model-value="onPrintFormatChange"
      />
    </div>

    <div class="toolbar__actions">
      <button type="button" title="Undo" :disabled="!canUndo || store.isBusy" @click="undo">
        ↩ Undo
      </button>
      <button type="button" title="Redo" :disabled="!canRedo || store.isBusy" @click="redo">
        ↪ Redo
      </button>
      <button
        type="button"
        class="is-blue"
        :class="{ 'is-active': preview }"
        :aria-pressed="preview"
        @click="preview = !preview"
      >
        👁 Preview
      </button>
      <button type="button" class="is-green" :disabled="isWorking" @click="openPublish">
        ↑ Publish
      </button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px 12px;
  height: 47px;
  box-sizing: border-box;
  padding: 0 4px 0 18px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.toolbar__brand {
  flex-shrink: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 16px 4px 0;
  border-right: 1px solid var(--border);
  font: 13px var(--mono);
  color: var(--muted);
  text-decoration: none;
  white-space: nowrap;
}

.toolbar__brand:hover {
  color: var(--text);
}

.toolbar__field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.toolbar__field > span {
  flex-shrink: 0;
}

.toolbar__field :deep(.select) {
  min-width: 0;
}

.toolbar__field :deep(.select__button) {
  max-width: 100%;
}

.toolbar__field > span {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.toolbar__field:first-of-type {
  gap: 20px;
}

.toolbar__field + .toolbar__field {
  margin-left: 8px;
}

.toolbar__field:first-of-type :deep(.select__button) {
  width: 144px;
}

.toolbar__actions {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  margin-left: auto;
}

button {
  height: 26px;
  padding: 0 9px;
  font: 13px var(--sans);
  color: var(--muted);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: 5px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--muted);
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.is-blue {
  min-width: 78px;
  color: var(--blue-soft);
  background: var(--blue-bg);
  border-color: var(--blue);
}

button.is-blue.is-active {
  border-color: var(--blue);
}

button.is-green {
  min-width: 111px;
  color: var(--green);
  background: var(--green-bg);
  border-color: var(--green);
}

button.is-green:hover:not(:disabled) {
  border-color: var(--green);
}
</style>
