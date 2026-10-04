<script setup>
import { nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { usePrintFormat } from '@/composables/usePrintFormat'
import PublishDialog from './PublishDialog.vue'
import ToastHost from './ToastHost.vue'
import HeaderToolbar from './HeaderToolbar.vue'
import DesignerActions from './DesignerActions.vue'
import FieldPalette from './FieldPalette.vue'
import ComponentPalette from './ComponentPalette.vue'
import DesignerCanvas from './DesignerCanvas.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import PreviewPanel from './PreviewPanel.vue'
import VersionPanel from './VersionPanel.vue'

const store = useSmartPrintStore()
provide(
  'printFormat',
  usePrintFormat(
    () => store.targetDoctype,
    () => store.currentSPF?.print_format,
  ),
)

const showPreview = ref(false)
const showHistory = ref(false)

const designer = useDesigner()

function isTyping(el) {
  return el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName)
}

async function onKeydown(event) {
  if (document.querySelector('dialog[open]')) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (mod && key === 's') {
    event.preventDefault()

    if (isTyping(document.activeElement)) document.activeElement.blur()
    await nextTick()
    designer.save()
    return
  }
  if (isTyping(event.target)) return

  if (mod && (key === 'z' || key === 'y')) {
    event.preventDefault()
    if (key === 'y' || event.shiftKey) designer.redo()
    else designer.undo()
  } else if ((key === 'delete' || key === 'backspace') && store.selectedNode && !mod) {
    event.preventDefault()
    designer.deleteNode(store.selectedNode)
  } else if (key === 'escape' && store.selectedNode) {
    designer.selectNode(null)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const historyDialog = ref(null)

watch(showHistory, (open) => {
  const dialog = historyDialog.value
  if (open && !dialog.open) dialog.showModal()
  if (!open && dialog.open) dialog.close()
})

function onHistoryClick(event) {
  if (event.target === historyDialog.value) showHistory.value = false
}
</script>

<template>
  <div class="designer">
    <HeaderToolbar v-model:preview="showPreview" v-model:history="showHistory" />

    <div class="designer__body">
      <div class="designer__sidebar">
        <FieldPalette />
        <ComponentPalette />
      </div>

      <div class="designer__center">
        <main class="designer__main">
          <DesignerCanvas v-show="!showPreview" />
          <PreviewPanel v-if="showPreview" />
        </main>
        <DesignerActions v-model:preview="showPreview" v-model:history="showHistory" />
      </div>

      <div class="designer__sidebar designer__sidebar--end">
        <PropertiesPanel />
      </div>
    </div>

    <dialog
      ref="historyDialog"
      class="designer__drawer"
      aria-label="Version history"
      @close="showHistory = false"
      @click="onHistoryClick"
    >
      <div class="designer__drawer-content">
        <div class="designer__drawer-bar">
          <button type="button" aria-label="Close history" @click="showHistory = false">×</button>
        </div>
        <VersionPanel v-if="showHistory" in-designer @restored="showHistory = false" />
      </div>
    </dialog>

    <PublishDialog />
    <ToastHost />
  </div>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: 100svh;
}

.designer__body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.designer__sidebar {
  width: 182px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  background: var(--panel);
  border-right: 1px solid var(--border);
}

.designer__sidebar--end {
  width: 196px;
  border-right: none;
  border-left: 1px solid var(--border);
}

.designer__center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.designer__main {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.designer__drawer {
  position: fixed;
  inset: 0 0 0 auto;
  width: min(360px, 100vw);
  max-width: none;
  height: 100svh;
  max-height: none;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  overflow-y: auto;
  border: none;
  border-left: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow);
}

.designer__drawer::backdrop {
  background: rgba(0, 0, 0, 0.3);
}

.designer__drawer-content {
  min-height: 100%;
}

.designer__drawer-bar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 8px 0;
}

.designer__drawer-bar button {
  width: 28px;
  height: 28px;
  font: 18px/1 var(--sans);
  color: var(--text);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}

.designer__drawer-bar button:hover {
  border-color: var(--border);
}
</style>
