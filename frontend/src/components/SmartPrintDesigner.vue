<script setup>
// The whole designer: puts the panels together and decides which ones are
// visible. It holds no business logic of its own: editing goes through
// useDesigner, document state and server calls through the Pinia store,
// and each panel handles its own part.
//
//   ┌──────────────────── HeaderToolbar ────────────────────┐
//   │ FieldPalette     │ DesignerCanvas   │ PropertiesPanel │
//   │ ComponentPalette │  (or Preview)    │                 │
//   └───────────────────────────────────────────────────────┘
//   VersionPanel opens as a drawer over the right side.
//
// Usage:
//   <SmartPrintDesigner />                    edit what's already in the store
//   <SmartPrintDesigner name="SPF-00001" />   load that Smart Print Format first

import { ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import HeaderToolbar from './HeaderToolbar.vue'
import FieldPalette from './FieldPalette.vue'
import ComponentPalette from './ComponentPalette.vue'
import DesignerCanvas from './DesignerCanvas.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import PreviewPanel from './PreviewPanel.vue'
import VersionPanel from './VersionPanel.vue'

const props = defineProps({
  name: { type: String, default: null },
})

const store = useSmartPrintStore()

// Opening another document from outside (e.g. the URL) loads it; the store
// resets selection and undo history.
watch(
  () => props.name,
  (name) => {
    if (name && name !== store.currentSPF?.name) store.load(name)
  },
  { immediate: true },
)

const showPreview = ref(false)
const showHistory = ref(false)

// ---- Version history drawer ----

// A modal <dialog> gives focus trapping, Esc to close and the backdrop for
// free. Its open state follows the toolbar's History toggle both ways.
const historyDialog = ref(null)

watch(showHistory, (open) => {
  const dialog = historyDialog.value
  if (open && !dialog.open) dialog.showModal()
  if (!open && dialog.open) dialog.close()
})

// Clicks on the backdrop land on the <dialog> element itself; clicks inside
// land on its content.
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

      <main class="designer__main">
        <!-- v-show keeps the canvas (and its scroll position) while previewing. -->
        <DesignerCanvas v-show="!showPreview" />
        <PreviewPanel v-if="showPreview" />
      </main>

      <!-- Stays usable during preview: the selection is kept, and prop edits
           show up in the preview as they're made. -->
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
      <!-- Fills the drawer, so only clicks outside it count as backdrop clicks. -->
      <div class="designer__drawer-content">
        <div class="designer__drawer-bar">
          <button type="button" aria-label="Close history" @click="showHistory = false">×</button>
        </div>
        <!-- Mounted only while open, so the list is fresh every time. -->
        <VersionPanel v-if="showHistory" />
      </div>
    </dialog>
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
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}

.designer__sidebar--end {
  width: 260px;
  border-right: none;
  border-left: 1px solid var(--border);
}

.designer__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}

/* Right-hand drawer, full height. */
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
  background: var(--bg);
  color: var(--text);
  box-shadow: var(--shadow);
}

.designer__drawer::backdrop {
  background: rgba(0, 0, 0, 0.25);
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
  color: var(--text-h);
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}

.designer__drawer-bar button:hover {
  border-color: var(--border);
}
</style>
