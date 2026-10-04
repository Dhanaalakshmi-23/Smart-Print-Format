<script setup>
import { onMounted, ref } from 'vue'
import { getActiveComponents } from '@/api/smartPrintApi'
import { useDesigner } from '@/composables/useDesigner'
import { setDragData } from '@/utils/dragData'
import { componentIcon } from '@/utils/icons'

const { addComponent } = useDesigner()

const components = ref([])
const loading = ref(false)
const error = ref(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    components.value = await getActiveComponents()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

const toPayload = (component) => ({
  name: component.name,
  component_name: component.component_name,
  component_type: component.component_type,
  configuration_json: component.configuration_json,
})

function onDragStart(event, component) {
  setDragData(event, { kind: 'component', component: toPayload(component) })
}

function onAdd(component) {
  addComponent(toPayload(component))
}
</script>

<template>
  <aside class="palette" aria-label="Components">
    <h3 class="palette__divider">—— Components ——</h3>

    <p v-if="loading" class="palette__message">Loading components…</p>
    <div v-else-if="error" class="palette__message is-error">
      <p>{{ error }}</p>
      <button type="button" class="palette__retry" @click="load">Retry</button>
    </div>
    <p v-else-if="!components.length" class="palette__message">
      No active Smart Print Format Components yet.
    </p>

    <ul v-else>
      <li v-for="component in components" :key="component.name">
        <button
          type="button"
          class="palette__item"
          draggable="true"
          :title="`${component.component_type}: ${component.description || component.component_name} — drag onto the canvas or click to add`"
          @dragstart="onDragStart($event, component)"
          @click="onAdd(component)"
        >
          <span class="palette__icon" aria-hidden="true">{{ componentIcon(component) }}</span>
          <span class="palette__label">{{ component.component_name }}</span>
        </button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.palette {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 8px 12px;
}

.palette__message {
  color: var(--muted);
  font-size: 12px;
}

.palette__message.is-error {
  color: var(--red);
}

.palette__retry {
  margin-top: 6px;
  padding: 3px 10px;
  font: inherit;
  color: var(--text);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.palette__divider {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 400;
  text-align: center;
  color: var(--muted);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.palette__item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  min-height: 24px;
  font: 12px var(--sans);
  color: var(--orange);
  text-align: left;
  background: var(--orange-bg);
  border: 1px solid var(--orange);
  border-radius: var(--radius-card);
  cursor: grab;
}

.palette__item:hover {
  border-color: var(--text);
}

.palette__item:active {
  cursor: grabbing;
}

.palette__icon {
  flex-shrink: 0;
  font-size: 12px;
}

.palette__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
