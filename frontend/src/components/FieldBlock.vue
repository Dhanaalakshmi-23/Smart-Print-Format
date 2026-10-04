<script setup>
import { computed, inject, ref } from 'vue'
import { useCanvasNode } from '@/composables/useCanvasNode'
import { resolveLabel } from '@/utils/fieldResolver'
import { canvasStyle } from '@/utils/htmlGenerator'
import { componentIcon } from '@/utils/icons'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import NodeActions from './NodeActions.vue'
import InlineEdit from './InlineEdit.vue'

const props = defineProps({
  node: { type: Object, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  total: { type: Boolean, default: false },
  caption: { type: Object, default: null },
})

const { meta, getChildMeta } = inject('doctypeMeta', { meta: ref(null), getChildMeta: () => null })
const { isSelected, select, onDragStart, moveBy, remove, updateProps } = useCanvasNode(
  () => props.node,
)
const store = useSmartPrintStore()
const { selectNode } = useDesigner()

const isComponent = computed(() => props.node.type === 'component')
const config = computed(() => props.node.configuration || {})
const isPageNumber = computed(() => isComponent.value && props.node.component_type === 'Page Number')

const componentText = computed(() => {
  const n = props.node
  if (n.component_type === 'Text' && config.value.text) return config.value.text
  if (n.component_type === 'Image' && (config.value.source || 'company_logo') === 'company_logo') {
    return 'Logo'
  }
  return n.component_name || n.component
})
const showIcon = computed(() => props.node.component_type !== 'Text')

const pageLine = computed(
  () => `${config.value.prefix || 'Page'} {{ page_no }} ${config.value.separator || 'of'} {{ pages }}`,
)

const captionText = computed(() => props.caption && `{{ doc.${props.caption.fieldname} }}`)
const captionSelected = computed(() => props.caption && store.selectedNode === props.caption.id)

const defaultLabel = computed(
  () => props.node.label || resolveLabel(props.node.fieldname, meta.value, getChildMeta),
)
const label = computed(() => props.node.props?.label || defaultLabel.value)

const componentPlacement = computed(() => {
  const align = props.node.props?.align
  return {
    width: 'fit-content',
    marginLeft: align === 'right' || align === 'center' ? 'auto' : 0,
    marginRight: align === 'center' ? 'auto' : 0,
  }
})

const placeholder = computed(() => {
  const [table, ...rest] = props.node.fieldname.split('.')
  return rest.length ? `{{ doc.${table}[0].${rest.join('.')} }}` : `{{ doc.${props.node.fieldname} }}`
})

function rename(value) {
  updateProps({ label: value && value !== defaultLabel.value ? value : undefined })
}
</script>

<template>
  <div
    class="block"
    :class="{
      'is-selected': isSelected,
      'is-component': isComponent && !isPageNumber,
      'is-page-number': isPageNumber,
      'has-caption': caption,
      'is-total': total,
    }"
    :style="[canvasStyle(node.props), isComponent && !isPageNumber && componentPlacement]"
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

    <template v-if="isPageNumber">{{ pageLine }}</template>

    <template v-else-if="isComponent">
      <span class="block__component">
        <span v-if="showIcon" aria-hidden="true">{{ componentIcon(node) }}</span>
        {{ componentText }}
      </span>
      <span
        v-if="caption"
        class="block__caption"
        :class="{ 'is-selected': captionSelected }"
        title="Field — click to select"
        @click.stop="selectNode(caption.id)"
      >
        {{ captionText }}
      </span>
    </template>

    <template v-else-if="total">
      <template v-if="!node.props?.hideLabel">{{ label }}: </template>{{ placeholder }}
    </template>

    <template v-else>
      <div v-if="!node.props?.hideLabel" class="block__label">
        <InlineEdit :value="label" placeholder="No label" @commit="rename" />
      </div>
      <div class="block__value">{{ placeholder }}</div>
    </template>

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
  padding: 3px 10px 4px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
}

.block.is-selected {
  border-color: var(--blue);
}

.block:hover:not(.is-selected) {
  border-color: var(--muted);
}

.block__label {
  color: var(--muted);
  font-size: 10px;
  font-weight: normal;
}

.block__value {
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: break-word;
}

.block.is-total {
  padding: 1px 4px;
  text-align: right;
  font-size: 11px;
  font-weight: 700;
  color: var(--green);
  background: none;
  border-color: transparent;
}

.block.is-component {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 88px;
  min-height: 31px;
  padding: 4px 14px;
  color: var(--purple);
  background: var(--purple-bg);
  border-color: var(--purple);
}

.block.is-component.is-selected {
  border-color: var(--blue);
}

.block__component {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
}

.block.has-caption {
  min-width: 165px;
  padding: 3px 14px 2px;
}

.block__caption {
  font-size: 9px;
  line-height: 1.3;
  color: var(--muted);
  border-radius: 2px;
  cursor: pointer;
}

.block__caption:hover,
.block__caption.is-selected {
  color: var(--blue-soft);
  box-shadow: 0 0 0 1px var(--blue);
}

.block.is-page-number {
  padding: 1px 4px;
  font-size: 10px;
  color: var(--muted);
  background: none;
  border-color: transparent;
}

.block.is-page-number:not([style*='text-align']) {
  text-align: center;
}

.block.is-page-number.is-selected {
  border-color: var(--blue);
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
