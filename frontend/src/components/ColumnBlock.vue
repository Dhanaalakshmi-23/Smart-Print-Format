<script setup>
import { computed, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { useDropList } from '@/composables/useDropList'
import { isTableField } from '@/utils/fieldResolver'
import { canvasStyle } from '@/utils/htmlGenerator'
import ConditionalBlock from './ConditionalBlock.vue'
import FieldBlock from './FieldBlock.vue'
import TableBlock from './TableBlock.vue'
import NodeActions from './NodeActions.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  dropStrip: { type: Boolean, default: false },
  quietEmpty: { type: Boolean, default: false },
})

const tableIndex = computed(() =>
  props.node.fields.findIndex((item) => item.type === 'field' && isTableField(item)),
)

const captions = computed(() => {
  const set = new Set()
  props.node.fields.forEach((item, i) => {
    const prev = props.node.fields[i - 1]
    if (
      prev?.type === 'component' &&
      prev.component_type !== 'Page Number' &&
      item.type === 'field' &&
      item.props?.hideLabel &&
      !isTableField(item)
    ) {
      set.add(i)
    }
  })
  return set
})

const { isSelected, select, onDragStart, moveBy, remove } = useCanvasNode(() => props.node)

const style = computed(() => {
  const { width, ...rest } = props.node.props || {}
  return canvasStyle(rest)
})

const listEl = ref(null)
const { dropIndex, onDragover, onDragleave, onDrop } = useDropList(listEl, {
  parentType: 'column',
  parentId: () => props.node.id,
})
</script>

<template>
  <div
    class="column"
    :class="{ 'is-selected': isSelected, 'is-quiet': quietEmpty && !node.fields.length }"
    :style="style"
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
        :class="{ 'drop-before': dropIndex === i, 'is-caption-slot': captions.has(i) }"
      >
        <template v-if="captions.has(i)" />
        <TableBlock
          v-else-if="item.type === 'field' && isTableField(item)"
          :node="item"
          :index="i"
          :count="node.fields.length"
        />
        <FieldBlock
          v-else
          :node="item"
          :index="i"
          :count="node.fields.length"
          :total="tableIndex !== -1 && i > tableIndex && item.type === 'field'"
          :caption="captions.has(i + 1) ? node.fields[i + 1] : null"
        />
      </ConditionalBlock>

      <p v-if="(!node.fields.length && !quietEmpty) || dropStrip" class="column__empty">
        Drop fields here
      </p>
    </div>
  </div>
</template>

<style scoped>
.column {
  position: relative;
  height: 100%;
  box-sizing: border-box;
  border: 1px dashed transparent;
  border-radius: 4px;
}

.column:hover {
  border-color: var(--border);
}

.column.is-selected {
  border: 1px solid var(--blue);
}

.column__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 20px;
  height: 100%;
}

.column.is-quiet .column__list {
  min-height: 6px;
}

.column__list > .is-caption-slot {
  margin-top: -4px;
}

.column__list.drop-end {
  box-shadow: inset 0 -3px 0 var(--blue);
}

.column__empty {
  margin-top: auto;
  padding: 0;
  text-align: center;
  color: var(--muted);
  font-size: 9px;
  border: 1px dashed var(--muted);
  border-radius: 3px;
}
</style>
