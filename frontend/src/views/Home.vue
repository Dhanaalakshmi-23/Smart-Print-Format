<script setup>
import { ref } from 'vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import FieldPalette from '@/components/FieldPalette.vue'
import ComponentPalette from '@/components/ComponentPalette.vue'
import DesignerCanvas from '@/components/DesignerCanvas.vue'

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
        <DesignerCanvas :preview="showPreview" />
      </main>
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

.builder__main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
</style>
