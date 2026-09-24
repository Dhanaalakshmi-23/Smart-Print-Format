<script setup>
// The A4 page the layout is designed on. Renders store.layoutJson (through
// useDesigner) as sections → columns → fields, and handles page-level
// drops, selection clearing and keyboard shortcuts.
//
// Usage:
//   <DesignerCanvas :preview="showPreview" />

import { computed, provide, ref } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { useDropList } from '@/composables/useDropList'
import { acceptsDrop, getDragData } from '@/utils/dragData'
import { generatePreview } from '@/utils/htmlGenerator'
import ConditionalBlock from './ConditionalBlock.vue'
import SectionBlock from './SectionBlock.vue'

const props = defineProps({
  // Show the generated preview HTML instead of the editable blocks.
  preview: { type: Boolean, default: false },
})

const store = useSmartPrintStore()
const designer = useDesigner()

// Loaded once here and shared with every block (labels, child tables).
const doctypeMeta = useDoctypeMeta(() => store.targetDoctype)
provide('doctypeMeta', doctypeMeta)

const sections = computed(() => designer.layoutState.value.sections)

// ---- Sections: reorder by dragging ----

const listEl = ref(null)
const { dropIndex, onDragover, onDragleave, onDrop } = useDropList(listEl, {
  parentType: 'layout',
  parentId: null,
})

// ---- Empty page: dropping a field creates the first section ----

const emptyOver = ref(false)

function onEmptyDragover(event) {
  if (!acceptsDrop(event, 'column')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
  emptyOver.value = true
}

function onEmptyDrop(event) {
  emptyOver.value = false
  if (!acceptsDrop(event, 'column')) return
  event.preventDefault()
  const payload = getDragData(event)
  if (payload?.kind === 'field') designer.addField(payload.field)
  if (payload?.kind === 'component') designer.addComponent(payload.component)
}

// ---- Selection & keyboard ----

function clearSelection() {
  designer.selectNode(null)
}

function onKeydown(event) {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
  if (typing) return

  if ((event.key === 'Delete' || event.key === 'Backspace') && store.selectedNode) {
    event.preventDefault()
    designer.deleteNode(store.selectedNode)
  } else if (event.key === 'Escape') {
    clearSelection()
  }
}

// ---- Preview ----

const previewHtml = computed(() => {
  if (!props.preview) return ''
  const { html, css } = generatePreview(store.layoutJson, {
    meta: doctypeMeta.meta.value,
    getChildMeta: doctypeMeta.getChildMeta,
  })
  // generatePreview escapes every value, so this is safe for v-html.
  return `<style>${css}</style>${html}`
})
</script>

<template>
  <div class="canvas" @keydown="onKeydown">
    <!-- Preview: read-only generated HTML -->
    <div v-if="preview" class="page" v-html="previewHtml" />

    <!-- Designer -->
    <div v-else class="page" @click="clearSelection">
      <div
        v-if="!sections.length"
        class="page__empty"
        :class="{ 'is-over': emptyOver }"
        @dragover="onEmptyDragover"
        @dragleave="emptyOver = false"
        @drop="onEmptyDrop"
      >
        <p>Drag a field here, or add a section to start.</p>
      </div>

      <div
        v-else
        ref="listEl"
        class="page__sections"
        :class="{ 'drop-end': dropIndex === sections.length }"
        @dragover="onDragover"
        @dragleave="onDragleave"
        @drop="onDrop"
      >
        <ConditionalBlock
          v-for="(section, i) in sections"
          :key="section.id"
          :node="section"
          :class="{ 'drop-before': dropIndex === i }"
        >
          <SectionBlock :node="section" :index="i" :count="sections.length" />
        </ConditionalBlock>
      </div>

      <button type="button" class="page__add" @click.stop="designer.addSection()">
        + Add section
      </button>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  min-height: 100%;
  box-sizing: border-box;
  padding: 24px;
  background: var(--code-bg);
}

/* A4 sheet: 210mm × 297mm with 15mm margins. Always paper-white, even in
   dark mode, because it represents the printed page. */
.page {
  width: 210mm;
  min-height: 297mm;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 15mm;
  background: #fff;
  color: #1f272e;
  box-shadow: var(--shadow);
  font: 12px/1.5 var(--sans);
  letter-spacing: normal;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page__sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page__sections.drop-end {
  box-shadow: inset 0 -3px 0 #7c3aed;
}

.page__empty {
  display: grid;
  place-items: center;
  min-height: 120px;
  border: 2px dashed #d1d8dd;
  border-radius: 6px;
  color: #8d99a6;
}

.page__empty.is-over {
  border-color: #7c3aed;
  background: rgba(124, 58, 237, 0.05);
}

.page__add {
  align-self: flex-start;
  font: 12px var(--sans);
  color: #7c3aed;
  background: transparent;
  border: 1px dashed #c4b5fd;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.page__add:hover {
  background: rgba(124, 58, 237, 0.05);
}
</style>
