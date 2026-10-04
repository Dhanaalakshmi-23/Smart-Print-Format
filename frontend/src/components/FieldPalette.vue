<script setup>
import { computed, ref } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { useDesigner } from '@/composables/useDesigner'
import { getTableColumns, isTableField } from '@/utils/fieldResolver'
import { fieldIcon, tableIcon } from '@/utils/icons'
import { setDragData } from '@/utils/dragData'

const props = defineProps({
  doctype: { type: String, default: null },
})

const store = useSmartPrintStore()
const { addField } = useDesigner()
const currentDoctype = computed(() => props.doctype || store.targetDoctype)
const { fields, tableFields, getChildMeta, loading, error, reload } = useDoctypeMeta(currentDoctype)

const printable = (df) => !df.print_hide
const isKeyField = (df) => df.reqd || df.in_list_view || df.bold || df.in_standard_filter

const standardFields = computed(() => fields.value.filter((df) => !isTableField(df) && printable(df)))
const tables = computed(() => tableFields.value.filter(printable))

const orderedFields = computed(() => [
  ...standardFields.value.filter(isKeyField),
  ...standardFields.value.filter((df) => !isKeyField(df)),
])

const query = ref('')
const matches = (df) => {
  const q = query.value.trim().toLowerCase()
  return !q || `${df.label || ''} ${df.fieldname}`.toLowerCase().includes(q)
}
const visibleFields = computed(() => orderedFields.value.filter(matches))
const visibleTables = computed(() => tables.value.filter(matches))

function fieldTitle(df) {
  const target = ['Link', 'Dynamic Link'].includes(df.fieldtype) && df.options ? ` → ${df.options}` : ''
  return `${df.fieldname} · ${df.fieldtype}${target} — drag onto the canvas or click to add`
}

function tableTitle(df) {
  const columns = getTableColumns(getChildMeta(df.options))
  const list = columns.length ? `: ${columns.map((c) => c.label || c.fieldname).join(', ')}` : ''
  return `${df.fieldname} → ${df.options}${list} — drag onto the canvas or click to add`
}

const toPayload = (df) => ({
  fieldname: df.fieldname,
  label: df.label || '',
  fieldtype: df.fieldtype,
  options: df.options || '',
})

function onDragStart(event, df) {
  setDragData(event, { kind: 'field', field: toPayload(df) })
}

function onAdd(df) {
  addField(toPayload(df))
}
</script>

<template>
  <aside class="palette" aria-label="Fields">
    <h2 class="panel-heading">Fields</h2>

    <input
      v-if="currentDoctype"
      v-model="query"
      type="search"
      class="palette__search"
      placeholder="Search fields…"
      aria-label="Search fields"
    />

    <p v-if="!currentDoctype" class="palette__message">Select a DocType to see its fields.</p>
    <p v-else-if="loading" class="palette__message">Loading {{ currentDoctype }} fields…</p>
    <div v-else-if="error" class="palette__message is-error">
      <p>{{ error }}</p>
      <button type="button" class="palette__retry" @click="reload">Retry</button>
    </div>

    <template v-else>
      <h3 class="palette__divider">—— Standard ——</h3>
      <ul class="palette__list is-scroll">
        <li v-for="df in visibleFields" :key="df.fieldname">
          <button
            type="button"
            class="palette__item"
            draggable="true"
            :title="fieldTitle(df)"
            @dragstart="onDragStart($event, df)"
            @click="onAdd(df)"
          >
            <span class="palette__icon" aria-hidden="true">{{ fieldIcon(df) }}</span>
            <span class="palette__label">{{ df.label || df.fieldname }}</span>
          </button>
        </li>
      </ul>
      <p v-if="!visibleFields.length" class="palette__message">
        {{ query ? 'No fields match.' : 'No printable fields.' }}
      </p>

      <template v-if="visibleTables.length">
        <h3 class="palette__divider">—— Tables ——</h3>
        <ul class="palette__list is-tables">
          <li v-for="df in visibleTables" :key="df.fieldname">
            <button
              type="button"
              class="palette__item is-table"
              draggable="true"
              :title="tableTitle(df)"
              @dragstart="onDragStart($event, df)"
              @click="onAdd(df)"
            >
              <span class="palette__icon" aria-hidden="true">{{ tableIcon(df) }}</span>
              <span class="palette__label">{{ df.label || df.fieldname }}</span>
            </button>
          </li>
        </ul>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.palette {
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 8px 4px;
}

.palette__search {
  flex-shrink: 0;
  height: 24px;
  margin: 2px 0;
  padding: 0 8px;
  box-sizing: border-box;
  font: 12px var(--sans);
  color: var(--text);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}

.palette__search::placeholder {
  color: var(--muted);
}

.palette__search:focus {
  border-color: var(--blue);
  outline: none;
}

.palette__message {
  color: var(--muted);
  font-size: 12px;
}

.palette__message.is-error {
  color: var(--red);
}

.palette__retry {
  margin-top: 6px;
  padding: 3px 10px;
  font: inherit;
  color: var(--text);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.palette__divider {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 400;
  text-align: center;
  color: var(--muted);
}

.palette__list {
  flex-shrink: 0;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.palette__list.is-scroll {
  flex-shrink: 1;
  min-height: 90px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.palette__list.is-tables {
  max-height: 150px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.palette__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  min-height: 24px;
  font: 12px var(--sans);
  color: var(--text);
  text-align: left;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  cursor: grab;
}

.palette__item:hover {
  border-color: var(--blue);
}

.palette__item.is-table {
  color: var(--purple);
  background: var(--purple-bg);
  border-color: var(--purple);
}

.palette__item.is-table:hover {
  border-color: var(--text);
}

.palette__item:active {
  cursor: grabbing;
}

.palette__icon {
  flex-shrink: 0;
  font-size: 12px;
}

.palette__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
