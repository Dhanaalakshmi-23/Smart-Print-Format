<script setup>
import { computed, inject, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { useDropList } from '@/composables/useDropList'
import { useDesigner } from '@/composables/useDesigner'
import { canvasStyle, columnFlexStyle } from '@/utils/htmlGenerator'
import { isTableField, resolveLabel } from '@/utils/fieldResolver'
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
const { meta, getChildMeta } = inject('doctypeMeta', { meta: ref(null), getChildMeta: () => null })
const { isSelected, select, onDragStart, moveBy, remove, updateProps } = useCanvasNode(
  () => props.node,
)

const kind = computed(() => props.node.kind || 'body')
const isFixed = computed(() => kind.value !== 'body')
const label = computed(() => props.node.props?.label || props.node.label || '')

const table = computed(() => {
  if (isFixed.value) return null
  const first = props.node.columns[0]?.fields[0]
  return first?.type === 'field' && isTableField(first) ? first : null
})

const tag = computed(() => {
  if (kind.value === 'header') return 'HEADER SECTION'
  if (kind.value === 'footer') return 'FOOTER SECTION'
  if (table.value) {
    const t = table.value
    return `TABLE SECTION — ${t.props?.label || t.label || resolveLabel(t.fieldname, meta.value, getChildMeta)}`
  }
  return `${props.node.columns.length}-COLUMN SECTION`
})

const tone = computed(() => (isFixed.value ? kind.value : table.value ? 'table' : 'body'))

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
    :class="[`is-${tone}`, { 'is-selected': isSelected }]"
    :style="canvasStyle(node.props)"
    :draggable="!isFixed"
    tabindex="0"
    @dragstart="isFixed ? $event.preventDefault() : onDragStart($event)"
    @click.stop="select"
    @keydown.enter.self.prevent="select"
  >
    <NodeActions
      v-if="isSelected"
      :label="isFixed ? kind : 'section'"
      :index="index"
      :count="count"
      :movable="!isFixed"
      @move="moveBy"
      @remove="remove"
    />

    <header class="section__header">
      <span class="section__tag">{{ tag }}</span>
      <h3 class="section__label" :class="{ 'is-empty': !label }">
        <InlineEdit
          :value="label"
          placeholder="+ heading"
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
        :style="columnFlexStyle(column.props)"
      >
        <ColumnBlock
          :node="column"
          :index="i"
          :count="node.columns.length"
          :drop-strip="Boolean(table)"
          :quiet-empty="kind === 'footer'"
        />
      </ConditionalBlock>
    </div>

  </section>
</template>

<style scoped>
.section {
  position: relative;
  padding: 6px 10px 6px;
  background: var(--panel);
  border: 1px dashed var(--border);
  border-radius: 4px;
  cursor: grab;
}

.section.is-header {
  background: var(--input);
  border: 1px solid var(--blue);
  cursor: default;
}

.section.is-footer {
  background: var(--card);
  border: 1px solid var(--border);
  cursor: default;
}

.section.is-table {
  background: var(--panel);
  border: 1px solid var(--purple);
}

.section.is-selected {
  border: 1px solid var(--blue);
}

.section__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  min-height: 15px;
}

.section__tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.section.is-header .section__tag {
  font-size: 11px;
  color: var(--blue-soft);
}

.section.is-table .section__tag {
  color: var(--text);
}

.section__label {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.section__label.is-empty,
.section__add {
  visibility: hidden;
  font-size: 10px;
  font-weight: normal;
}

.section:hover > .section__header .section__label.is-empty,
.section:hover > .section__header .section__add,
.section.is-selected > .section__header .section__label.is-empty,
.section.is-selected > .section__header .section__add {
  visibility: visible;
}

.section__add {
  font-family: var(--sans);
  color: var(--blue);
  background: transparent;
  border: 1px dashed var(--blue);
  border-radius: 3px;
  padding: 0 6px;
  cursor: pointer;
}

.section__columns {
  display: flex;
  gap: 8px;
}

.section__columns.drop-end {
  box-shadow: inset -3px 0 0 var(--blue);
}

.section__column {
  flex: 1;
  min-width: 0;
}
</style>
