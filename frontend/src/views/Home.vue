<script setup>
import { ref } from 'vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import FieldPalette from '@/components/FieldPalette.vue'
import ComponentPalette from '@/components/ComponentPalette.vue'
import DesignerCanvas from '@/components/DesignerCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import PreviewPanel from '@/components/PreviewPanel.vue'
import VersionPanel from '@/components/VersionPanel.vue'

const showPreview = ref(false)
const sidePanel = ref('properties') // 'properties' | 'versions'
</script>

<template>
  <div class="builder">
    <HeaderToolbar v-model:preview="showPreview" />

    <div class="builder__body">
      <div class="builder__sidebar">
        <FieldPalette />
        <ComponentPalette />
      </div>

      <main class="builder__main">
        <!-- v-show keeps the canvas (and its scroll position) while previewing. -->
        <DesignerCanvas v-show="!showPreview" />
        <PreviewPanel v-if="showPreview" />
      </main>

      <div class="builder__sidebar builder__sidebar--end">
        <div class="builder__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="sidePanel === 'properties'"
            :disabled="showPreview"
            @click="sidePanel = 'properties'"
          >
            Properties
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="sidePanel === 'versions' || showPreview"
            @click="sidePanel = 'versions'"
          >
            History
          </button>
        </div>
        <!-- Nothing can be selected while previewing, so show history then. -->
        <VersionPanel v-if="sidePanel === 'versions' || showPreview" />
        <PropertiesPanel v-else />
      </div>
    </div>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  height: 100svh;
}

.builder__body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.builder__sidebar {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}

.builder__sidebar--end {
  width: 260px;
  border-right: none;
  border-left: 1px solid var(--border);
}

.builder__tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.builder__tabs button {
  flex: 1;
  padding: 8px;
  font: 13px var(--sans);
  color: var(--text);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}

.builder__tabs button[aria-selected='true'] {
  color: var(--text-h);
  border-bottom-color: var(--accent);
}

.builder__tabs button:disabled {
  opacity: 0.5;
  cursor: default;
}

.builder__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
</style>
