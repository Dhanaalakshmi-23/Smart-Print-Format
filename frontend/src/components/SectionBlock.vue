<script setup>
// A section: an optional heading and a row of columns. Columns can be
// reordered by dragging them sideways.

import { computed, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { useDropList } from '@/composables/useDropList'
import { useDesigner } from '@/composables/useDesigner'
import { propsToStyle } from '@/utils/htmlGenerator'
import ConditionalBlock from './ConditionalBlock.vue'
import ColumnBlock from './ColumnBlock.vue'
import NodeActions from './NodeActions.vue'
import InlineEdit from './InlineEdit.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const { addColumn } = useDesigner()
const { isSelected, select, onDragStart, moveBy, remove, updateProps } = useCanvasNode(
  () => props.node,
)

const label = computed(() => props.node.props?.label || props.node.label || '')

const listEl = ref(null)
const { dropIndex, onDragover, onDragleave, onDrop } = useDropList(listEl, {
  parentType: 'section',
  parentId: () => props.node.id,
  axis: 'x',
})
</script>

<template>
  <section
    class="section"
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
      label="section"
      :index="index"
      :count="count"
      @move="moveBy"
      @remove="remove"
    />

    <header class="section__header">
      <h3 class="section__label">
        <InlineEdit
          :value="label"
          placeholder="Untitled section"
          @commit="(value) => updateProps({ label: value || undefined })"
        />
      </h3>
      <button type="button" class="section__add" @click.stop="addColumn(node.id)">+ Column</button>
    </header>

    <div
      ref="listEl"
      class="section__columns"
      :class="{ 'drop-end': dropIndex === node.columns.length }"
      @dragover="onDragover"
      @dragleave="onDragleave"
      @drop="onDrop"
    >
      <ConditionalBlock
        v-for="(column, i) in node.columns"
        :key="column.id"
        :node="column"
        class="section__column"
        :class="{ 'drop-before-x': dropIndex === i }"
      >
        <ColumnBlock :node="column" :index="i" :count="node.columns.length" />
      </ConditionalBlock>
    </div>
  </section>
</template>

<style scoped>
.section {
  position: relative;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: grab;
}

.section:hover {
  border-color: #e2e6e9;
}

.section.is-selected {
  border-color: #7c3aed;
}

.section:focus-visible {
  outline: 2px solid #7c3aed;
  outline-offset: 1px;
}

.section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.section__label {
  flex: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1f272e;
  letter-spacing: normal;
}

/* Designer-only control: visible on hover/selection. */
.section__add {
  visibility: hidden;
  font: 11px var(--sans);
  color: #7c3aed;
  background: transparent;
  border: 1px dashed #c4b5fd;
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
}

.section:hover .section__add,
.section.is-selected .section__add {
  visibility: visible;
}

.section__columns {
  display: flex;
  gap: 8px;
}

.section__columns.drop-end {
  box-shadow: inset -3px 0 0 #7c3aed;
}

.section__column {
  flex: 1;
  min-width: 0;
}
</style>
