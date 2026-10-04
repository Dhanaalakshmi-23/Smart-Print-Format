<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { createDefaultLayout } from '@/utils/layout'
import DesignerLayout from '@/components/DesignerLayout.vue'

const props = defineProps({
  name: { type: String, default: null },
})

const store = useSmartPrintStore()
const router = useRouter()
const loading = ref(false)
const loadError = ref(null)

async function load(name) {
  if (!name) {
    loadError.value = null
    store.newSPF({}, createDefaultLayout())
    return
  }

  if (adopting && store.currentSPF?.name === name) {
    adopting = false
    return
  }
  loading.value = true
  loadError.value = null
  await store.load(name)
  if (store.status === 'error') loadError.value = store.error
  loading.value = false
}

let adopting = false
watch(() => props.name, load, { immediate: true })

watch(
  () => store.currentSPF?.name,
  (name) => {
    if (name && !props.name) {
      adopting = true
      router.replace({ name: 'designer', params: { name } })
    }
  },
)

const isReady = computed(
  () =>
    !loading.value && !loadError.value && (props.name ? store.currentSPF?.name === props.name : true),
)

const UNSAVED_MESSAGE = 'You have unsaved changes. Leave the designer and discard them?'

function confirmLeave() {
  return !store.isDirty || window.confirm(UNSAVED_MESSAGE)
}

onBeforeRouteLeave(confirmLeave)
onBeforeRouteUpdate(confirmLeave)

function onBeforeUnload(event) {
  if (store.isDirty) event.preventDefault()
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <DesignerLayout v-if="isReady" />

  <div v-else class="state">
    <template v-if="loadError">
      <p class="state__error" role="alert">Could not open “{{ name }}”: {{ loadError }}</p>
      <p>
        <button type="button" @click="load(name)">Retry</button>
        <RouterLink :to="{ name: 'dashboard' }">Back to all formats</RouterLink>
      </p>
    </template>
    <p v-else>Loading “{{ name }}”…</p>
  </div>
</template>

<style scoped>
.state {
  max-width: 600px;
  margin: 80px auto;
  padding: 0 16px;
  text-align: center;
  font-size: 14px;
}

.state__error {
  color: var(--red);
}

.state p {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}

a {
  color: var(--blue);
}
</style>
