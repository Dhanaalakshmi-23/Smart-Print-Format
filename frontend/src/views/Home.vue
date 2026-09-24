<script setup>
import { ref } from 'vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import FieldPalette from '@/components/FieldPalette.vue'
import ComponentPalette from '@/components/ComponentPalette.vue'
import DesignerCanvas from '@/components/DesignerCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import PreviewPanel from '@/components/PreviewPanel.vue'

const showPreview = ref(false)
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

      <div v-if="!showPreview" class="builder__sidebar builder__sidebar--end">
        <PropertiesPanel />
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

.builder__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
</style>
