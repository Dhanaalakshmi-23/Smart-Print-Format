<script setup>
// Lists the fields of the selected DocType so they can be dragged onto the
// canvas (or clicked to add them to the selected column).
//
// Usage:
//   <FieldPalette />                        uses the store's target DocType
//   <FieldPalette doctype="Sales Invoice" />

import { computed, ref } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { useDesigner } from '@/composables/useDesigner'
import { STANDARD_FIELDS, isTableField } from '@/utils/fieldResolver'
import { setDragData } from '@/utils/dragData'

const props = defineProps({
  // Defaults to the DocType of the Smart Print Format being edited.
  doctype: { type: String, default: null },
})

const store = useSmartPrintStore()
const { addField } = useDesigner()
const currentDoctype = computed(() => props.doctype || store.targetDoctype)
const { fields, tableFields, loading, error, reload } = useDoctypeMeta(currentDoctype)

const search = ref('')

function matches(field) {
  const query = search.value.trim().toLowerCase()
  if (!query) return true
  return (
    (field.label || '').toLowerCase().includes(query) ||
    field.fieldname.toLowerCase().includes(query)
  )
}

const groups = computed(() =>
  [
    { key: 'fields', title: 'Fields', items: fields.value.filter((df) => !isTableField(df)) },
    { key: 'tables', title: 'Table Fields', items: tableFields.value },
    { key: 'standard', title: 'Standard Fields', items: STANDARD_FIELDS },
  ].map((group) => ({ ...group, items: group.items.filter(matches) })),
)

const hasResults = computed(() => groups.value.some((group) => group.items.length))

// Only what the layout needs, not the whole docfield.
const toPayload = (df) => ({
  fieldname: df.fieldname,
  label: df.label || '',
  fieldtype: df.fieldtype,
  options: df.options || '',
})

function onDragStart(event, df) {
  setDragData(event, { kind: 'field', field: toPayload(df) })
}

// Keyboard/click alternative to dragging.
function onAdd(df) {
  addField(toPayload(df))
}
</script>

<template>
  <aside class="palette" aria-label="Fields">
    <h2 class="palette__title">Fields</h2>

    <p v-if="!currentDoctype" class="palette__message">Select a DocType to see its fields.</p>
    <p v-else-if="loading" class="palette__message">Loading fields…</p>
    <div v-else-if="error" class="palette__message is-error">
      <p>{{ error }}</p>
      <button type="button" @click="reload">Retry</button>
    </div>

    <template v-else>
      <input
        v-model="search"
        class="palette__search"
        type="search"
        placeholder="Search fields"
        aria-label="Search fields"
      />

      <p v-if="!hasResults" class="palette__message">No fields match “{{ search }}”.</p>

      <template v-for="group in groups" :key="group.key">
        <details v-if="group.items.length" class="palette__group" open>
          <summary>
            {{ group.title }} <span class="palette__count">{{ group.items.length }}</span>
          </summary>
          <ul>
            <li v-for="df in group.items" :key="df.fieldname">
              <button
                type="button"
                class="palette__item"
                draggable="true"
                :title="`${df.fieldname} — drag onto the canvas or click to add`"
                @dragstart="onDragStart($event, df)"
                @click="onAdd(df)"
              >
                <span class="palette__label">{{ df.label || df.fieldname }}</span>
                <span class="palette__type">{{ df.fieldtype }}</span>
              </button>
            </li>
          </ul>
        </details>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  overflow-y: auto;
}

.palette__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.palette__message {
  margin: 0;
  color: var(--text);
}

.palette__message.is-error {
  color: #d9383a;
}

.palette__search,
button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
}

.palette__group summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-h);
  padding: 4px 0;
}

.palette__count {
  font-weight: normal;
  color: var(--text);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.palette__item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: grab;
}

.palette__item:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.palette__item:active {
  cursor: grabbing;
}

.palette__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette__type {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text);
}
</style>
