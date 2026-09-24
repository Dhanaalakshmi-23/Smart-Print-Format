<script setup>
// A single field (label + value placeholder) or a reusable component on the canvas.

import { computed, inject, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { resolveLabel } from '@/utils/fieldResolver'
import { propsToStyle } from '@/utils/htmlGenerator'
import NodeActions from './NodeActions.vue'
import InlineEdit from './InlineEdit.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

// Provided by DesignerCanvas; the fallback lets the block render standalone.
const { meta, getChildMeta } = inject('doctypeMeta', { meta: ref(null), getChildMeta: () => null })
const { isSelected, select, onDragStart, moveBy, remove, updateProps } = useCanvasNode(
  () => props.node,
)

const isComponent = computed(() => props.node.type === 'component')

const defaultLabel = computed(
  () => props.node.label || resolveLabel(props.node.fieldname, meta.value, getChildMeta),
)
const label = computed(() => props.node.props?.label || defaultLabel.value)

// Store only real overrides; renaming back to the default clears it.
function rename(value) {
  updateProps({ label: value && value !== defaultLabel.value ? value : undefined })
}
</script>

<template>
  <div
    class="block"
    :class="{ 'is-selected': isSelected, 'is-component': isComponent }"
    :style="propsToStyle(node.props)"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click.stop="select"
    @keydown.enter.self.prevent="select"
  >
    <NodeActions
      v-if="isSelected"
      :label="isComponent ? 'component' : 'field'"
      :index="index"
      :count="count"
      @move="moveBy"
      @remove="remove"
    />

    <template v-if="isComponent">
      <span class="block__tag">{{ node.component_type || 'Component' }}</span>
      <span class="block__name">{{ node.component_name || node.component }}</span>
    </template>

    <template v-else>
      <div v-if="!node.props?.hideLabel" class="block__label">
        <InlineEdit :value="label" placeholder="No label" @commit="rename" />
      </div>
      <div class="block__value">{{ node.fieldname }}</div>
    </template>
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
}

.block__value {
  color: #8d99a6;
  font-family: var(--mono);
  font-size: 11px;
}

.block.is-component {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed #b8c2cc;
}

.block__tag {
  padding: 0 6px;
  border-radius: 3px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 10px;
}
</style>
