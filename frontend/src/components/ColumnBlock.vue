<script setup>
// A column inside a section: a vertical list of fields, tables and components
// that accepts drops from the palettes and from other columns.

import { ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { useDropList } from '@/composables/useDropList'
import { isTableField } from '@/utils/fieldResolver'
import { propsToStyle } from '@/utils/htmlGenerator'
import ConditionalBlock from './ConditionalBlock.vue'
import FieldBlock from './FieldBlock.vue'
import TableBlock from './TableBlock.vue'
import NodeActions from './NodeActions.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
})

const { isSelected, select, onDragStart, moveBy, remove } = useCanvasNode(() => props.node)

const listEl = ref(null)
const { dropIndex, onDragover, onDragleave, onDrop } = useDropList(listEl, {
  parentType: 'column',
  parentId: () => props.node.id,
})
</script>

<template>
  <div
    class="column"
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
      label="column"
      axis="x"
      :index="index"
      :count="count"
      @move="moveBy"
      @remove="remove"
    />

    <div
      ref="listEl"
      class="column__list"
      :class="{ 'drop-end': dropIndex === node.fields.length }"
      @dragover="onDragover"
      @dragleave="onDragleave"
      @drop="onDrop"
    >
      <ConditionalBlock
        v-for="(item, i) in node.fields"
        :key="item.id"
        :node="item"
        :class="{ 'drop-before': dropIndex === i }"
      >
        <TableBlock
          v-if="item.type === 'field' && isTableField(item)"
          :node="item"
          :index="i"
          :count="node.fields.length"
        />
        <FieldBlock v-else :node="item" :index="i" :count="node.fields.length" />
      </ConditionalBlock>

      <p v-if="!node.fields.length" class="column__empty">Drop fields here</p>
    </div>
  </div>
</template>

<style scoped>
.column {
  position: relative;
  height: 100%;
  box-sizing: border-box;
  padding: 4px;
  border: 1px dashed #e2e6e9;
  border-radius: 3px;
}

.column.is-selected {
  border: 1px solid #7c3aed;
}

.column:focus-visible {
  outline: 2px solid #7c3aed;
  outline-offset: 1px;
}

.column__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 40px;
  height: 100%;
}

.column__list.drop-end {
  box-shadow: inset 0 -3px 0 #7c3aed;
}

.column__empty {
  margin: auto 0;
  text-align: center;
  color: #b8c2cc;
  font-size: 11px;
}
</style>
