<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useDoctypeMeta } from '@/composables/useDoctypeMeta'
import { useDropList } from '@/composables/useDropList'
import { acceptsDrop, getDragData, hasDragData } from '@/utils/dragData'
import { bodyRange, findSectionByKind } from '@/utils/layout'
import { FOOTER_PAGE_LINE } from '@/utils/htmlGenerator'
import ConditionalBlock from './ConditionalBlock.vue'
import SectionBlock from './SectionBlock.vue'

const store = useSmartPrintStore()
const designer = useDesigner()

const doctypeMeta = useDoctypeMeta(() => store.targetDoctype)
provide('doctypeMeta', doctypeMeta)

const layout = computed(() => designer.layoutState.value)
const header = computed(() => findSectionByKind(layout.value, 'header'))
const footer = computed(() => findSectionByKind(layout.value, 'footer'))
const bodySections = computed(() => {
  const { start, end } = bodyRange(layout.value)
  return layout.value.sections.slice(start, end)
})

const listEl = ref(null)
const { dropIndex, onDragover, onDragleave, onDrop } = useDropList(listEl, {
  parentType: 'layout',
  parentId: null,

  indexOffset: () => bodyRange(layout.value).start,
})

const isNewItemDrag = (event) =>
  acceptsDrop(event, 'column') && event.dataTransfer.effectAllowed !== 'move'

function useSectionDrop(kind) {
  const over = ref(false)
  return {
    over,
    onDragover(event) {
      if (!isNewItemDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      over.value = true
    },
    onDragleave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) over.value = false
    },
    onDrop(event) {
      over.value = false
      if (!isNewItemDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      const payload = getDragData(event)
      const placement = { newSection: { kind } }
      if (payload?.kind === 'field') designer.addField(payload.field, placement)
      if (payload?.kind === 'component') designer.addComponent(payload.component, placement)
    },
  }
}

const headerDrop = useSectionDrop('header')
const bodyDrop = useSectionDrop(undefined)
const footerDrop = useSectionDrop('footer')

const dragging = ref(false)
const onWindowDragstart = (event) =>
  (dragging.value = hasDragData(event) && event.dataTransfer.effectAllowed !== 'move')
const onWindowDragend = () => (dragging.value = false)
onMounted(() => {
  window.addEventListener('dragstart', onWindowDragstart)
  window.addEventListener('dragend', onWindowDragend)
  window.addEventListener('drop', onWindowDragend)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragstart', onWindowDragstart)
  window.removeEventListener('dragend', onWindowDragend)
  window.removeEventListener('drop', onWindowDragend)
})

function clearSelection() {
  designer.selectNode(null)
}
</script>

<template>
  <div class="canvas">
    <h2 class="canvas__title">PRINT CANVAS (A4)</h2>

    <div class="page" @click="clearSelection">
      <ConditionalBlock v-if="header" :node="header">
        <SectionBlock :node="header" :index="0" :count="1" />
      </ConditionalBlock>
      <div
        v-else
        class="placeholder is-header"
        :class="{ 'is-over': headerDrop.over.value }"
        @dragover="headerDrop.onDragover"
        @dragleave="headerDrop.onDragleave"
        @drop="headerDrop.onDrop"
        @click.stop="designer.addSection({ kind: 'header', columns: 2 })"
      >
        <span class="placeholder__tag">HEADER SECTION</span>
        <div class="placeholder__drop">Drop fields here</div>
      </div>

      <div
        ref="listEl"
        class="page__sections"
        :class="{ 'drop-end': dropIndex === bodySections.length }"
        @dragover="onDragover"
        @dragleave="onDragleave"
        @drop="onDrop"
      >
        <ConditionalBlock
          v-for="(section, i) in bodySections"
          :key="section.id"
          :node="section"
          :class="{ 'drop-before': dropIndex === i }"
        >
          <SectionBlock :node="section" :index="i" :count="bodySections.length" />
        </ConditionalBlock>
      </div>

      <div
        v-if="dragging || !bodySections.length"
        class="placeholder__drop is-new"
        :class="{ 'is-over': bodyDrop.over.value }"
        @dragover="bodyDrop.onDragover"
        @dragleave="bodyDrop.onDragleave"
        @drop="bodyDrop.onDrop"
      >
        Drop fields here for a new section
      </div>

      <div class="page__footer">
        <ConditionalBlock v-if="footer" :node="footer">
          <SectionBlock :node="footer" :index="0" :count="1" />
        </ConditionalBlock>
        <div
          v-else
          class="placeholder is-footer"
          :class="{ 'is-over': footerDrop.over.value }"
          @dragover="footerDrop.onDragover"
          @dragleave="footerDrop.onDragleave"
          @drop="footerDrop.onDrop"
          @click.stop="designer.addSection({ kind: 'footer' })"
        >
          <span class="placeholder__tag">FOOTER SECTION</span>
          <p class="placeholder__page">{{ FOOTER_PAGE_LINE }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas {
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0 38px 3px;
  background: var(--bg);
}

.canvas__title {
  margin: 10px 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-align: center;
  color: var(--muted);
}

.page {
  flex: 1;
  width: 100%;
  max-width: 210mm;
  min-height: 420px;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font: 12px/1.45 var(--sans);
}

.page__sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.page__sections:empty {
  display: none;
}

.page__sections.drop-end {
  box-shadow: 0 3px 0 var(--blue);
}

.page__footer {
  margin-top: auto;
}

.placeholder {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}

.placeholder.is-header {
  border-color: var(--blue);
}

.placeholder.is-over {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.placeholder__tag {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.placeholder.is-header .placeholder__tag {
  font-size: 11px;
  color: var(--blue-soft);
}

.placeholder__page {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
}

.placeholder__drop {
  padding: 2px;
  text-align: center;
  font-size: 10px;
  color: var(--muted);
  border: 1px dashed var(--muted);
  border-radius: 3px;
}

.placeholder__drop.is-new {
  padding: 10px;
}

.placeholder__drop.is-over {
  border-color: var(--blue);
  background: var(--blue-bg);
}
</style>
