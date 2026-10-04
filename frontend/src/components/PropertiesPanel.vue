<script setup>
import { computed, inject } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import {
  columnWidthTotal,
  isTableField,
  labelFromFieldname,
  resolveField,
  resolveLabel,
  tableSettings,
} from '@/utils/fieldResolver'
import { tableIssues } from '@/utils/validation'
import { DEFAULT_TEXT_COLOR } from '@/utils/htmlGenerator'
import { isValidColor } from '@/utils/layout'

const STYLE_CONTROLS = ['fontSize', 'fontWeight', 'align']
const VISIBILITY_CONTROLS = ['color', 'visibility', 'condition']

const CONTROLS = {
  section: ['label', ...STYLE_CONTROLS, ...VISIBILITY_CONTROLS],
  column: [...STYLE_CONTROLS, 'width', ...VISIBILITY_CONTROLS],
  field: ['label', ...STYLE_CONTROLS, 'width', ...VISIBILITY_CONTROLS],
  component: [...STYLE_CONTROLS, 'width', ...VISIBILITY_CONTROLS],
}

const ALIGNMENTS = ['left', 'center', 'right']
const FONT_SIZE = { min: 6, max: 72 }

const DEFAULT_FONT_SIZE = 12
const DEFAULT_COLOR = DEFAULT_TEXT_COLOR

const store = useSmartPrintStore()
const { selectedNode: node, updateProps } = useDesigner()

const { meta, getChildMeta } = useDoctypeMeta(() => store.targetDoctype)

const nodeProps = computed(() => node.value?.props || {})
const has = (control) => CONTROLS[node.value?.type]?.includes(control)

const title = computed(() => {
  const n = node.value
  if (!n) return ''
  if (n.type === 'field') {
    return `${nodeProps.value.label || defaultLabel.value} ${isTableField(n) ? 'Table' : 'Field'}`
  }
  if (n.type === 'component') return `${n.component_name || n.component} Component`
  if (n.type === 'section' && n.kind) return `${n.kind === 'header' ? 'Header' : 'Footer'} Section`
  return n.type === 'section' ? 'Section' : 'Column'
})

function set(key, value) {
  if (nodeProps.value[key] === value) return
  updateProps(node.value.id, { [key]: value })
}

// Inputs commit on change (Enter/blur), so one edit is one undo step.
function commitInput(event, key, parse, format = (value) => value ?? '') {
  set(key, parse(event.target.value))
  event.target.value = format(nodeProps.value[key])
}

const parseText = (value) => value.trim() || undefined

const defaultLabel = computed(() => {
  const n = node.value
  if (n?.type === 'field') return n.label || resolveLabel(n.fieldname, meta.value, getChildMeta)
  return n?.label || ''
})

function commitLabel(event) {
  commitInput(
    event,
    'label',
    (value) => {
      const label = parseText(value)
      return label === defaultLabel.value ? undefined : label
    },
    (value) => value || defaultLabel.value,
  )
}

const defaultWidth = computed(() => (node.value?.type === 'column' ? null : 100))

const fontSizeText = computed(() => `${nodeProps.value.fontSize ?? DEFAULT_FONT_SIZE}px`)
const widthText = computed(() => {
  const width = nodeProps.value.width ?? defaultWidth.value
  return width == null ? '' : `${width}%`
})

function commitUnit(event, key, { min, max, fallback, unit }) {
  const raw = event.target.value.trim()
  const number = Math.round(parseFloat(raw))
  let value
  if (raw === '') value = undefined
  else if (!Number.isFinite(number)) value = nodeProps.value[key]
  else value = Math.min(Math.max(number, min), max)
  if (value === fallback) value = undefined
  set(key, value)
  const shown = nodeProps.value[key] ?? fallback
  event.target.value = shown == null ? '' : `${shown}${unit}`
}

const colorText = computed(() => nodeProps.value.color || DEFAULT_COLOR)

const pickerColor = computed(() =>
  /^#[0-9a-f]{6}$/i.test(colorText.value) ? colorText.value : '#000000',
)

const storedColor = (color) => (color && color.toLowerCase() !== DEFAULT_COLOR ? color : undefined)

function commitColor(event) {
  commitInput(
    event,
    'color',
    (value) => {
      const color = parseText(value)

      return !color || isValidColor(color) ? storedColor(color) : nodeProps.value.color
    },
    (value) => value || DEFAULT_COLOR,
  )
}

const LAYOUT_TYPES = ['Section Break', 'Column Break', 'Tab Break', 'Button', 'Table', 'Table MultiSelect']
const NUMBER_TYPES = ['Currency', 'Float', 'Int', 'Percent']

const tableInfo = computed(() => {
  const n = node.value
  if (n?.type !== 'field' || n.fieldname.includes('.')) return null
  const info = resolveField(n.fieldname, meta.value, getChildMeta) || n
  return isTableField(info) ? info : null
})
const childMeta = computed(() => (tableInfo.value ? getChildMeta(tableInfo.value.options) : null))
const table = computed(() => (tableInfo.value ? tableSettings(node.value, childMeta.value) : null))

const childFields = computed(() =>
  (childMeta.value?.fields || []).filter((df) => !LAYOUT_TYPES.includes(df.fieldtype)),
)

const totalFields = computed(() =>
  (meta.value?.fields || []).filter((df) => NUMBER_TYPES.includes(df.fieldtype)),
)

const chosenColumn = (fieldname) => table.value?.columns.find((c) => c.fieldname === fieldname)

const storedColumns = () =>
  table.value.columns.map((c) => {
    const column = { fieldname: c.fieldname }
    if (c.label && c.label !== (c.df?.label || labelFromFieldname(c.fieldname))) column.label = c.label
    if (c.width) column.width = c.width
    return column
  })

function toggleColumn(df, on) {
  let columns = storedColumns().filter((c) => c.fieldname !== df.fieldname)
  if (on) columns = [...storedColumns(), { fieldname: df.fieldname }]

  set('columns', columns.length ? columns : undefined)
}

function setColumn(fieldname, changes) {
  const columns = storedColumns().map((c) => {
    if (c.fieldname !== fieldname) return c
    const next = { ...c, ...changes }
    Object.keys(next).forEach((key) => next[key] === undefined && delete next[key])
    return next
  })
  set('columns', columns)
}

function commitColumnLabel(event, df) {
  const label = event.target.value.trim()
  setColumn(df.fieldname, { label: label && label !== (df.label || df.fieldname) ? label : undefined })
  event.target.value = chosenColumn(df.fieldname)?.label || ''
}

function commitColumnWidth(event, df) {
  const raw = event.target.value.trim()
  const number = Math.round(parseFloat(raw))
  const width = raw === '' || !Number.isFinite(number) ? undefined : Math.min(Math.max(number, 1), 100)
  setColumn(df.fieldname, { width })
  const stored = chosenColumn(df.fieldname)?.width
  event.target.value = stored ? `${stored}%` : ''
}

const widthTotal = computed(() => (table.value ? columnWidthTotal(table.value.columns) : 0))
const tableErrors = computed(() =>
  tableInfo.value ? tableIssues(node.value, tableInfo.value, { meta: meta.value, getChildMeta }) : [],
)

const printFormat = inject('printFormat', null)

function commitTitle(event) {
  const title = event.target.value.trim()
  if (title && title !== store.currentSPF?.title) store.setFields({ title })
  event.target.value = store.currentSPF?.title || ''
}
</script>

<template>
  <aside class="panel" aria-label="Properties">
    <h2 class="panel-heading">Properties</h2>

    <div v-if="!node" class="panel__form">
      <div class="panel__empty">
        <p class="panel__empty-title">Nothing selected</p>
        <p class="panel__hint">Click a field, table or section on the canvas to edit its properties.</p>
      </div>

      <label class="panel__row">
        <span>Format Title</span>
        <input type="text" :value="store.currentSPF?.title || ''" @change="commitTitle" />
      </label>

      <div class="panel__row">
        <span>Status</span>
        <p class="panel__value">
          {{ store.currentSPF?.status || 'Draft' }} · v{{ store.currentSPF?.version ?? 1 }}
        </p>
      </div>

      <p v-if="printFormat && !printFormat.belongsToDoctype.value" class="panel__hint is-error">
        Print Format {{ store.currentSPF?.print_format }} belongs to another DocType. Select one for
        {{ store.targetDoctype }}.
      </p>
    </div>

    <form v-else :key="node.id" class="panel__form" @submit.prevent>
      <p class="panel__title" :title="node.fieldname || node.component_type || ''">{{ title }}</p>

      <label v-if="has('label')" class="panel__row">
        <span>Label</span>
        <input
          type="text"
          :value="nodeProps.label || defaultLabel"
          placeholder="No label"
          @change="commitLabel"
        />
      </label>

      <label v-if="has('fontSize')" class="panel__row">
        <span>Font Size</span>
        <input
          type="text"
          inputmode="numeric"
          :value="fontSizeText"
          @change="commitUnit($event, 'fontSize', { ...FONT_SIZE, fallback: DEFAULT_FONT_SIZE, unit: 'px' })"
        />
      </label>

      <label v-if="has('fontWeight')" class="panel__row">
        <span>Font Weight</span>
        <select
          :value="nodeProps.bold ? 'bold' : 'normal'"
          @change="set('bold', $event.target.value === 'bold' || undefined)"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </label>

      <div v-if="has('align')" class="panel__row">
        <span id="panel-align">Text Align</span>
        <div class="panel__segments" role="radiogroup" aria-labelledby="panel-align">
          <button
            v-for="align in ALIGNMENTS"
            :key="align"
            type="button"
            role="radio"
            :aria-label="align"
            :aria-checked="(nodeProps.align || 'left') === align"
            :class="{ 'is-active': (nodeProps.align || 'left') === align }"
            @click="set('align', align === 'left' ? undefined : align)"
          >
            {{ { left: 'Left', center: 'Ctr', right: 'Rgt' }[align] }}
          </button>
        </div>
      </div>

      <label v-if="has('width')" class="panel__row">
        <span>Width</span>
        <input
          type="text"
          inputmode="numeric"
          :value="widthText"
          placeholder="Auto"
          @change="commitUnit($event, 'width', { min: 1, max: 100, fallback: defaultWidth, unit: '%' })"
        />
      </label>

      <div v-if="has('color')" class="panel__row">
        <span id="panel-color">Color</span>
        <div class="panel__color">
          <input
            type="color"
            :value="pickerColor"
            aria-labelledby="panel-color"
            @change="set('color', storedColor($event.target.value))"
          />
          <input type="text" :value="colorText" aria-labelledby="panel-color" @change="commitColor" />
        </div>
      </div>

      <label v-if="has('visibility')" class="panel__row">
        <span>Visibility</span>
        <select
          :value="nodeProps.hidden ? 'hidden' : 'always'"
          @change="set('hidden', $event.target.value === 'hidden' || undefined)"
        >
          <option value="always">Always</option>
          <option value="hidden">Hidden in print</option>
        </select>
      </label>

      <template v-if="table">
        <p class="panel__group">Table</p>

        <div class="panel__row">
          <span id="panel-columns">Columns</span>
          <p v-if="!childMeta" class="panel__hint">Loading {{ tableInfo.options }} fields…</p>
          <ul v-else class="panel__columns" aria-labelledby="panel-columns">
            <li v-for="df in childFields" :key="df.fieldname" :class="{ 'is-on': chosenColumn(df.fieldname) }">
              <label class="panel__check">
                <input
                  type="checkbox"
                  :checked="Boolean(chosenColumn(df.fieldname))"
                  @change="toggleColumn(df, $event.target.checked)"
                />
                <span>{{ df.label || df.fieldname }}</span>
              </label>
              <div v-if="chosenColumn(df.fieldname)" class="panel__column-edit">
                <input
                  type="text"
                  :value="chosenColumn(df.fieldname).label"
                  :aria-label="`${df.label || df.fieldname} column label`"
                  placeholder="Label"
                  @change="commitColumnLabel($event, df)"
                />
                <input
                  type="text"
                  inputmode="numeric"
                  class="panel__column-width"
                  :value="chosenColumn(df.fieldname).width ? `${chosenColumn(df.fieldname).width}%` : ''"
                  :aria-label="`${df.label || df.fieldname} column width`"
                  placeholder="auto"
                  @change="commitColumnWidth($event, df)"
                />
              </div>
            </li>
          </ul>
          <small v-if="!table.configured">Default columns (“In List View”). Tick fields to choose your own.</small>
          <small :class="{ 'is-error': widthTotal > 100 }">Widths: {{ widthTotal }}% of 100%</small>
        </div>

        <label class="panel__row">
          <span>Show Header</span>
          <select
            :value="table.showHeader ? 'yes' : 'no'"
            @change="set('showHeader', $event.target.value === 'yes' ? undefined : false)"
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label class="panel__row">
          <span>Show Total</span>
          <select
            :value="table.showTotal ? 'yes' : 'no'"
            @change="set('showTotal', $event.target.value === 'yes' || undefined)"
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </label>

        <label v-if="table.showTotal" class="panel__row">
          <span>Total Field</span>
          <select :value="table.totalField || ''" @change="set('totalField', $event.target.value || undefined)">
            <option value="">Select a field</option>
            <option v-for="df in totalFields" :key="df.fieldname" :value="df.fieldname">
              {{ df.label || df.fieldname }}
            </option>
          </select>
        </label>

        <ul v-if="tableErrors.length" class="panel__errors" role="alert">
          <li v-for="(message, i) in tableErrors" :key="i">{{ message }}</li>
        </ul>
      </template>

      <label v-if="has('condition')" class="panel__row">
        <span>Depends On</span>
        <textarea
          rows="2"
          spellcheck="false"
          :value="nodeProps.condition || ''"
          placeholder="eval:doc.customer != ''"
          :disabled="Boolean(nodeProps.hidden)"
          title="Printed only when this condition is true"
          @change="commitInput($event, 'condition', parseText)"
        />
      </label>
    </form>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
}

.panel__form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel__title {
  margin-bottom: 2px;
  font-size: 13px;
  font-weight: 700;
  color: var(--blue);
  overflow-wrap: anywhere;
}

.panel__group {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--purple);
}

.panel__columns {
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: 4px;
  scrollbar-width: thin;
}

.panel__columns li.is-on {
  padding-bottom: 3px;
}

.panel__check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text);
  cursor: pointer;
}

.panel__check input {
  margin: 0;
  accent-color: var(--blue);
}

.panel__column-edit {
  display: flex;
  gap: 4px;
  margin: 2px 0 0 18px;
}

.panel__column-edit input {
  flex: 1;
  height: 20px;
  font-size: 11px;
  background: var(--card);
}

.panel__column-edit .panel__column-width {
  flex: 0 0 48px;
}

.panel__row small.is-error,
.panel__errors {
  color: var(--red);
}

.panel__errors {
  margin: 0;
  padding: 0 0 0 14px;
  font-size: 11px;
}

.panel__empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 10px;
  margin-bottom: 4px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
}

.panel__empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.panel__row {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.panel__row > span {
  font-size: 11px;
  color: var(--muted);
}

.panel__row small,
.panel__hint {
  font-size: 11px;
  color: var(--muted);
}

.panel__hint.is-error {
  color: var(--red);
}

.panel__value {
  color: var(--text);
  overflow-wrap: anywhere;
}

.panel__value.is-muted {
  color: var(--muted);
}

input:not([type='checkbox'], [type='color']),
select,
textarea,
button {
  height: 22px;
  font: 11.5px var(--sans);
  color: var(--text);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 8px;
  box-sizing: border-box;
  min-width: 0;
}

select {
  appearance: none;
  cursor: pointer;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--blue);
  outline: none;
}

textarea {
  height: auto;
  min-height: 36px;
  padding: 4px 8px;
  resize: vertical;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--muted);
}

textarea:disabled {
  opacity: 0.5;
}

.panel__segments {
  display: flex;
  gap: 6px;
}

.panel__segments button {
  height: 22px;
}

.panel__segments button {
  flex: 1;
  cursor: pointer;
  color: var(--muted);
}

.panel__segments button.is-active {
  color: var(--blue-soft);
  border-color: var(--blue);
  background: var(--blue-bg);
}

.panel__color {
  display: flex;
  gap: 6px;
}

.panel__color input[type='color'] {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--muted);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}

.panel__color input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

.panel__color input[type='color']::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.panel__color input[type='text'] {
  flex: 1;
}

</style>
