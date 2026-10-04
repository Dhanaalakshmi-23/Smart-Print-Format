<script setup>
import { computed, inject, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { resolveLabel, tableSettings } from '@/utils/fieldResolver'
import { canvasStyle } from '@/utils/htmlGenerator'
import NodeActions from './NodeActions.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const { meta, getChildMeta } = inject('doctypeMeta', { meta: ref(null), getChildMeta: () => null })
const { isSelected, select, onDragStart, moveBy, remove } = useCanvasNode(
  () => props.node,
)

const settings = computed(() => tableSettings(props.node, getChildMeta(props.node.options)))
const columns = computed(() => settings.value.columns)
const totalLabel = computed(() => resolveLabel(settings.value.totalField, meta.value, getChildMeta))

const loopStart = computed(() => `{% for row in doc.${props.node.fieldname} %}`)
const cell = (column) => `{{ row.${column.fieldname} }}`
const totalCell = computed(() => `{{ doc.${settings.value.totalField} }}`)
</script>

<template>
  <div
    class="block"
    :class="{ 'is-selected': isSelected }"
    :style="canvasStyle(node.props)"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click.stop="select"
    @keydown.enter.self.prevent="select"
  >
    <NodeActions
      v-if="isSelected"
      label="table"
      :index="index"
      :count="count"
      @move="moveBy"
      @remove="remove"
    />

    <table v-if="columns.length" class="table">
      <colgroup>
        <col v-for="column in columns" :key="column.fieldname" :style="column.width ? { width: `${column.width}%` } : null" />
      </colgroup>
      <thead v-if="settings.showHeader">
        <tr>
          <th v-for="column in columns" :key="column.fieldname">{{ column.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr class="table__loop">
          <td :colspan="columns.length">{{ loopStart }}</td>
        </tr>
        <tr>
          <td v-for="column in columns" :key="column.fieldname">{{ cell(column) }}</td>
        </tr>
        <tr class="table__loop">
          <td :colspan="columns.length">{% endfor %}</td>
        </tr>
      </tbody>
      <tfoot v-if="settings.showTotal && settings.totalField">
        <tr class="table__total">
          <td :colspan="columns.length">{{ totalLabel }}: {{ totalCell }}</td>
        </tr>
      </tfoot>
    </table>
    <p v-else class="table__missing">
      Table <code>{{ node.fieldname }}</code> → {{ node.options || 'unknown DocType' }}
      (columns appear once its metadata is loaded)
    </p>

    <span
      v-if="node.props?.color"
      class="block__swatch"
      :style="{ background: node.props.color }"
      :title="`Print color ${node.props.color}`"
    />
  </div>
</template>

<style scoped>
.block {
  position: relative;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: grab;
}

.block:hover:not(.is-selected) {
  border-color: var(--muted);
}

.block.is-selected {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 11px;
}

.table th,
.table td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table th {
  padding: 4px 10px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  color: var(--purple);
  background: var(--purple-bg);
}

.table td {
  padding: 4px 10px;
  font-size: 10px;
  color: var(--text);
  background: var(--card);
}

.table__loop td {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--muted);
  background: none;
}

.table__total td {
  text-align: right;
  font-weight: 700;
  color: var(--green);
  background: none;
}

.table__missing {
  color: var(--muted);
  font-size: 11px;
}

.block__swatch {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
}
</style>
