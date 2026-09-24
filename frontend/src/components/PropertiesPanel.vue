<script setup>
// Properties of the node selected on the canvas. Which controls appear
// depends on the node type (see CONTROLS); every change goes through
// useDesigner().updateProps(), so it is undoable like any canvas edit.
//
// Text and number inputs commit on `change` (Enter or blur), not on every
// keystroke, so one edit is one undo step.
//
// Usage:
//   <PropertiesPanel />

import { computed } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { isTableField, resolveLabel } from '@/utils/fieldResolver'

const STYLE_CONTROLS = ['fontSize', 'fontWeight', 'align', 'color']
const VISIBILITY_CONTROLS = ['hidden', 'condition']

// Controls shown for each node type, in display order.
const CONTROLS = {
  section: ['label', ...STYLE_CONTROLS, ...VISIBILITY_CONTROLS],
  column: ['width', ...STYLE_CONTROLS, ...VISIBILITY_CONTROLS],
  field: ['label', 'hideLabel', 'width', ...STYLE_CONTROLS, ...VISIBILITY_CONTROLS],
  component: ['width', ...STYLE_CONTROLS, ...VISIBILITY_CONTROLS],
}

const ALIGNMENTS = ['left', 'center', 'right']
const FONT_SIZE = { min: 6, max: 72 }

const store = useSmartPrintStore()
const { selectedNode: node, updateProps } = useDesigner()
// Shares the cached metadata with the canvas; only used for default labels.
const { meta, getChildMeta } = useDoctypeMeta(() => store.targetDoctype)

const nodeProps = computed(() => node.value?.props || {})
const has = (control) => CONTROLS[node.value?.type]?.includes(control)

const title = computed(() => {
  const n = node.value
  if (!n) return ''
  if (n.type === 'field') return isTableField(n) ? 'Table' : 'Field'
  if (n.type === 'component') return n.component_type || 'Component'
  return n.type.charAt(0).toUpperCase() + n.type.slice(1)
})

const subtitle = computed(() => {
  const n = node.value
  if (n?.type === 'field') return n.fieldname
  if (n?.type === 'component') return n.component_name || n.component
  return ''
})

// ---- Writing ----

// `undefined` removes the prop (it is dropped when the layout is cloned).
function set(key, value) {
  if (nodeProps.value[key] === value) return // no empty undo steps
  updateProps(node.value.id, { [key]: value })
}

// Commit a text/number input, then show the stored value: the parsed value
// may differ from what was typed (trimmed, clamped, or rejected).
function commitInput(event, key, parse, format = (value) => value ?? '') {
  set(key, parse(event.target.value))
  event.target.value = format(nodeProps.value[key])
}

const parseText = (value) => value.trim() || undefined

// ---- Label ----

// Fields fall back to the DocType label; sections to the label they were
// created with. Store only real overrides so the default keeps following
// the DocType.
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
    (value) => value || '',
  )
}

// ---- Numbers ----

// Empty clears the prop; out-of-range values are clamped.
function commitNumber(event, key, min, max) {
  commitInput(event, key, (value) => {
    if (value.trim() === '') return undefined
    const number = Math.round(Number(value))
    if (!Number.isFinite(number)) return nodeProps.value[key]
    return Math.min(Math.max(number, min), max)
  })
}

// ---- Color ----

// <input type="color"> only understands #rrggbb; named colors show as black.
const pickerColor = computed(() =>
  /^#[0-9a-f]{6}$/i.test(nodeProps.value.color || '') ? nodeProps.value.color : '#000000',
)

function commitColor(event) {
  commitInput(event, 'color', (value) => {
    const color = parseText(value)
    // Same rule as propsToStyle: anything else would be ignored when rendering.
    return !color || /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(color) ? color : nodeProps.value.color
  })
}
</script>

<template>
  <aside class="panel" aria-label="Properties">
    <h2 class="panel__title">Properties</h2>

    <p v-if="!node" class="panel__message">Select an element on the canvas to edit it.</p>

    <!-- Keyed by id so inputs reset when the selection changes. -->
    <form v-else :key="node.id" class="panel__form" @submit.prevent>
      <p class="panel__node">
        <span class="panel__type">{{ title }}</span>
        <span v-if="subtitle" class="panel__name">{{ subtitle }}</span>
      </p>

      <!-- ---- Content ---- -->

      <label v-if="has('label')" class="panel__row">
        <span>Label</span>
        <input
          type="text"
          :value="nodeProps.label || ''"
          :placeholder="defaultLabel || 'No label'"
          @change="commitLabel"
        />
      </label>

      <label v-if="has('hideLabel')" class="panel__check">
        <input
          type="checkbox"
          :checked="!nodeProps.hideLabel"
          @change="set('hideLabel', $event.target.checked ? undefined : true)"
        />
        <span>Show label</span>
      </label>

      <!-- ---- Layout & text ---- -->

      <label v-if="has('width')" class="panel__row">
        <span>Width (%)</span>
        <input
          type="number"
          min="1"
          max="100"
          :value="nodeProps.width ?? ''"
          placeholder="Auto"
          @change="commitNumber($event, 'width', 1, 100)"
        />
      </label>

      <label v-if="has('fontSize')" class="panel__row">
        <span>Font size (px)</span>
        <input
          type="number"
          :min="FONT_SIZE.min"
          :max="FONT_SIZE.max"
          :value="nodeProps.fontSize ?? ''"
          placeholder="Default"
          @change="commitNumber($event, 'fontSize', FONT_SIZE.min, FONT_SIZE.max)"
        />
      </label>

      <label v-if="has('fontWeight')" class="panel__row">
        <span>Font weight</span>
        <select
          :value="nodeProps.bold ? 'bold' : 'normal'"
          @change="set('bold', $event.target.value === 'bold' || undefined)"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </label>

      <div v-if="has('align')" class="panel__row">
        <span id="panel-align">Text alignment</span>
        <div class="panel__segments" role="radiogroup" aria-labelledby="panel-align">
          <button
            v-for="align in ALIGNMENTS"
            :key="align"
            type="button"
            role="radio"
            :aria-checked="(nodeProps.align || 'left') === align"
            :class="{ 'is-active': (nodeProps.align || 'left') === align }"
            @click="set('align', align === 'left' ? undefined : align)"
          >
            {{ align }}
          </button>
        </div>
      </div>

      <div v-if="has('color')" class="panel__row">
        <span id="panel-color">Color</span>
        <div class="panel__color">
          <input
            type="color"
            :value="pickerColor"
            aria-labelledby="panel-color"
            @change="set('color', $event.target.value)"
          />
          <input
            type="text"
            :value="nodeProps.color || ''"
            placeholder="Default"
            aria-labelledby="panel-color"
            @change="commitColor"
          />
          <button
            v-if="nodeProps.color"
            type="button"
            title="Reset color"
            @click="set('color', undefined)"
          >
            ×
          </button>
        </div>
      </div>

      <!-- ---- Visibility ---- -->

      <label v-if="has('hidden')" class="panel__check">
        <input
          type="checkbox"
          :checked="Boolean(nodeProps.hidden)"
          @change="set('hidden', $event.target.checked || undefined)"
        />
        <span>Hide in print</span>
      </label>

      <label v-if="has('condition')" class="panel__row">
        <span>Depends on</span>
        <textarea
          rows="2"
          spellcheck="false"
          :value="nodeProps.condition || ''"
          placeholder="doc.status == 'Paid'"
          :disabled="Boolean(nodeProps.hidden)"
          @change="commitInput($event, 'condition', parseText)"
        />
        <small>Printed only when this condition is true.</small>
      </label>
    </form>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  overflow-y: auto;
}

.panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.panel__message {
  margin: 0;
  color: var(--text);
}

.panel__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel__node {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  min-width: 0;
}

.panel__type {
  font-weight: 600;
  color: var(--text-h);
}

.panel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
  font-size: 11px;
}

.panel__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel__row > span {
  font-size: 12px;
}

.panel__row small {
  font-size: 11px;
}

.panel__check {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

input:not([type='checkbox'], [type='color']),
select,
textarea,
button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  box-sizing: border-box;
  min-width: 0;
}

textarea {
  resize: vertical;
  font-family: var(--mono);
  font-size: 12px;
}

textarea:disabled {
  opacity: 0.5;
}

.panel__segments {
  display: flex;
}

.panel__segments button {
  flex: 1;
  cursor: pointer;
  text-transform: capitalize;
  border-radius: 0;
}

.panel__segments button:first-child {
  border-radius: 6px 0 0 6px;
}

.panel__segments button:last-child {
  border-radius: 0 6px 6px 0;
}

.panel__segments button + button {
  border-left: none;
}

.panel__segments button.is-active {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.panel__color {
  display: flex;
  gap: 4px;
}

.panel__color input[type='color'] {
  width: 32px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}

.panel__color input[type='text'] {
  flex: 1;
}

.panel__color button {
  cursor: pointer;
}
</style>
