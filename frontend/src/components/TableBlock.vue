<script setup>
// A child-table field (e.g. Sales Invoice "items"), drawn as a table whose
// columns come from the child DocType's "In List View" fields.

import { computed, inject, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { getTableColumns, resolveLabel } from '@/utils/fieldResolver'
import { propsToStyle } from '@/utils/htmlGenerator'
import NodeActions from './NodeActions.vue'
import InlineEdit from './InlineEdit.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const { meta, getChildMeta } = inject('doctypeMeta', { meta: ref(null), getChildMeta: () => null })
const { isSelected, select, onDragStart, moveBy, remove, updateProps } = useCanvasNode(
  () => props.node,
)

// `options` of a Table field is the child DocType's name.
const columns = computed(() => getTableColumns(getChildMeta(props.node.options)))

const defaultLabel = computed(
  () => props.node.label || resolveLabel(props.node.fieldname, meta.value, getChildMeta),
)
const label = computed(() => props.node.props?.label || defaultLabel.value)

function rename(value) {
  updateProps({ label: value && value !== defaultLabel.value ? value : undefined })
}
</script>

<template>
  <div
    class="block"
    :class="{ 'is-selected': isSelected }"
    :style="propsToStyle(node.props)"
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

    <div v-if="!node.props?.hideLabel" class="block__label">
      <InlineEdit :value="label" placeholder="No label" @commit="rename" />
    </div>

    <table v-if="columns.length" class="table">
      <thead>
        <tr>
          <th v-for="df in columns" :key="df.fieldname">{{ df.label || df.fieldname }}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td v-for="df in columns" :key="df.fieldname" class="table__placeholder">
            {{ df.fieldname }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="table__missing">
      Table <code>{{ node.fieldname }}</code> ({{ node.options || 'unknown DocType' }})
    </p>
  </div>
</template>

<style scoped>
.block {
  position: relative;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 3px;
  cursor: grab;
}

.block:hover {
  border-color: #d1d8dd;
}

.block.is-selected {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.05);
}

.block:focus-visible {
  outline: 2px solid #7c3aed;
  outline-offset: 1px;
}

.block__label {
  color: #6c7680;
  font-size: 11px;
  margin-bottom: 2px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.table th,
.table td {
  border: 1px solid #d1d8dd;
  padding: 3px 6px;
  text-align: left;
}

.table th {
  background: #f4f5f6;
  font-weight: 600;
}

.table__placeholder {
  color: #8d99a6;
  font-family: var(--mono);
}

.table__missing {
  margin: 0;
  color: #8d99a6;
  font-size: 11px;
}
</style>
