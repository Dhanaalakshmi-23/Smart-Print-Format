<script setup>
// Lists the active reusable Smart Print Format Components, grouped by type,
// so they can be dragged onto the canvas.

import { computed, onMounted, ref } from 'vue'
import { getActiveComponents } from '@/api/smartPrintApi'
import { setDragData } from '@/utils/dragData'

const components = ref([])
const loading = ref(false)
const error = ref(null)
const search = ref('')

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

// { 'Header': [...], 'Footer': [...] }, filtered by the search box.
const groups = computed(() => {
  const query = search.value.trim().toLowerCase()
  const byType = {}
  for (const component of components.value) {
    const text = `${component.component_name} ${component.description || ''}`.toLowerCase()
    if (query && !text.includes(query)) continue
    ;(byType[component.component_type] ||= []).push(component)
  }
  return Object.entries(byType)
})

// Shown through <img>, never v-html: an <img> can't run scripts or event
// handlers embedded in the SVG.
const thumbnailSrc = (svg) => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null)

function onDragStart(event, component) {
  setDragData(event, {
    kind: 'component',
    component: {
      name: component.name,
      component_name: component.component_name,
      component_type: component.component_type,
      configuration_json: component.configuration_json,
    },
  })
}
</script>

<template>
  <aside class="palette" aria-label="Components">
    <h2 class="palette__title">Components</h2>

    <p v-if="loading" class="palette__message">Loading components…</p>
    <div v-else-if="error" class="palette__message is-error">
      <p>{{ error }}</p>
      <button type="button" @click="load">Retry</button>
    </div>
    <p v-else-if="!components.length" class="palette__message">No active components yet.</p>

    <template v-else>
      <input
        v-model="search"
        class="palette__search"
        type="search"
        placeholder="Search components"
        aria-label="Search components"
      />

      <p v-if="!groups.length" class="palette__message">No components match “{{ search }}”.</p>

      <details v-for="[type, items] in groups" :key="type" class="palette__group" open>
        <summary>
          {{ type }} <span class="palette__count">{{ items.length }}</span>
        </summary>
        <ul>
          <li
            v-for="component in items"
            :key="component.name"
            class="palette__card"
            draggable="true"
            :title="`${component.component_name} — drag onto the canvas`"
            @dragstart="onDragStart($event, component)"
          >
            <img
              v-if="component.thumbnail_svg"
              class="palette__thumb"
              :src="thumbnailSrc(component.thumbnail_svg)"
              alt=""
            />
            <div class="palette__text">
              <span class="palette__label">{{ component.component_name }}</span>
              <span v-if="component.description" class="palette__description">
                {{ component.description }}
              </span>
            </div>
          </li>
        </ul>
      </details>
    </template>
  </aside>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
  overflow-y: auto;
}

.palette__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.palette__message {
  margin: 0;
  color: var(--text);
}

.palette__message.is-error {
  color: #d9383a;
}

.palette__search,
button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
}

.palette__group summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--text-h);
  padding: 4px 0;
}

.palette__count {
  font-weight: normal;
  color: var(--text);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.palette__card {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: grab;
}

.palette__card:hover {
  border-color: var(--accent-border);
  background: var(--accent-bg);
}

.palette__card:active {
  cursor: grabbing;
}

.palette__thumb {
  width: 48px;
  height: 36px;
  flex-shrink: 0;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #fff;
}

.palette__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.palette__label {
  color: var(--text-h);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette__description {
  font-size: 11px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
