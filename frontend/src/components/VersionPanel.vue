<script setup>
import { computed, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { getVersion, getVersions, restoreVersion } from '@/api/smartPrintApi'
import { useDesigner } from '@/composables/useDesigner'
import { useToast } from '@/composables/useToast'
import { formatDateTime as formatDate } from '@/utils/format'
import PreviewPanel from './PreviewPanel.vue'

const props = defineProps({
  name: { type: String, default: null },
  inDesigner: { type: Boolean, default: false },
})
const emit = defineEmits(['restored'])

const store = useSmartPrintStore()
const spfName = computed(() => props.name || store.currentSPF?.name || null)

const isOpenInStore = computed(() => spfName.value === store.currentSPF?.name)

const versions = ref([])
const loading = ref(false)
const error = ref(null)

let requestId = 0

async function loadVersions() {
  const id = ++requestId
  error.value = null
  if (!spfName.value) {
    versions.value = []
    loading.value = false
    return
  }

  loading.value = true
  try {
    const list = await getVersions(spfName.value)
    if (id === requestId) versions.value = list
  } catch (err) {
    if (id === requestId) error.value = `Could not load versions: ${err.message}`
  } finally {
    if (id === requestId) loading.value = false
  }
}

watch(spfName, loadVersions, { immediate: true })

store.$onAction(({ name, after }) => {
  if (name === 'publish') after(loadVersions)
})

const dialog = ref(null)
const opened = ref(null)
const openingName = ref(null)

async function open(version) {
  openingName.value = version.name
  error.value = null
  try {
    const doc = await getVersion(version.name)
    if (!doc.layout_json?.sections) throw new Error('its layout is missing or invalid.')
    opened.value = doc
    dialog.value.showModal()
  } catch (err) {
    error.value = `Could not open version ${version.version_number}: ${err.message}`
  } finally {
    openingName.value = null
  }
}

function close() {
  dialog.value?.close()
}

const restoring = ref(false)
const confirming = ref(null)
const toast = useToast()

async function restore(version) {
  restoring.value = true
  error.value = null
  try {
    if (props.inDesigner && isOpenInStore.value) {
      const doc = await getVersion(version.name)
      if (!doc.layout_json?.sections) throw new Error('its layout is missing or invalid.')
      useDesigner().replaceLayout(doc.layout_json)
      toast.success(`Version ${version.version_number} loaded — review it, then Save or Publish.`)
    } else {
      await restoreVersion(version.name)
      if (isOpenInStore.value) {
        await store.load(spfName.value)
        if (store.status === 'error') throw new Error(store.error)
      }
      toast.success(`Version ${version.version_number} restored.`)
    }
    confirming.value = null
    close()
    emit('restored', version)
  } catch (err) {
    error.value = `Could not restore version ${version.version_number}: ${err.message}`
  } finally {
    restoring.value = false
  }
}

const busy = computed(() => restoring.value || store.isBusy)
</script>

<template>
  <aside class="versions" aria-label="Version history">
    <header class="versions__header">
      <h2 class="versions__title">Versions</h2>
      <button
        v-if="spfName"
        type="button"
        class="versions__reload"
        :disabled="loading"
        title="Reload versions"
        @click="loadVersions"
      >
        Reload
      </button>
    </header>

    <p v-if="error" class="versions__message is-error" role="alert">{{ error }}</p>

    <p v-if="!spfName" class="versions__message">
      Save this Smart Print Format to start keeping versions.
    </p>
    <p v-else-if="loading && !versions.length" class="versions__message">Loading versions…</p>
    <p v-else-if="!versions.length" class="versions__message">
      No versions yet. Publishing creates one.
    </p>

    <ul v-else class="versions__list">
      <li v-for="version in versions" :key="version.name" class="version">
        <div class="version__head">
          <span class="version__number">v{{ version.version_number }}</span>
          <span v-if="version.is_published" class="version__badge is-published">Published</span>
          <span v-else class="version__badge">Unpublished</span>
        </div>

        <p v-if="version.change_summary" class="version__summary">{{ version.change_summary }}</p>

        <p class="version__meta">
          {{ formatDate(version.created_on) }}
          <template v-if="version.created_by"> · {{ version.created_by }}</template>
        </p>

        <div v-if="confirming === version.name" class="version__confirm" role="alert">
          <p>
            Restore v{{ version.version_number }}?
            <template v-if="inDesigner">Its layout replaces the canvas (you can undo).</template>
            <template v-else>The current layout is kept as a backup version.</template>
          </p>
          <div class="version__actions">
            <button type="button" class="is-primary" :disabled="busy" @click="restore(version)">
              {{ restoring ? 'Restoring…' : 'Confirm restore' }}
            </button>
            <button type="button" :disabled="restoring" @click="confirming = null">Cancel</button>
          </div>
        </div>
        <div v-else class="version__actions">
          <button
            type="button"
            :disabled="openingName === version.name"
            @click="open(version)"
          >
            {{ openingName === version.name ? 'Opening…' : 'Open' }}
          </button>
          <button type="button" :disabled="busy" @click="confirming = version.name">Restore</button>
        </div>
      </li>
    </ul>

    <dialog ref="dialog" class="versions__dialog" @close="opened = null">
      <template v-if="opened">
        <header class="versions__dialog-bar">
          <h3>
            Version {{ opened.version_number }}
            <small>{{ formatDate(opened.created_on) }}</small>
          </h3>
          <template v-if="confirming === opened.name">
            <span class="versions__dialog-ask">Restore v{{ opened.version_number }}?</span>
            <button type="button" class="is-primary" :disabled="busy" @click="restore(opened)">
              {{ restoring ? 'Restoring…' : 'Confirm restore' }}
            </button>
            <button type="button" :disabled="restoring" @click="confirming = null">Cancel</button>
          </template>
          <button v-else type="button" :disabled="busy" @click="confirming = opened.name">
            Restore this version
          </button>
          <button type="button" @click="close">Close</button>
        </header>
        <p v-if="error" class="versions__dialog-summary versions__message is-error" role="alert">
          {{ error }}
        </p>
        <p v-if="opened.change_summary" class="versions__dialog-summary">
          {{ opened.change_summary }}
        </p>
        <PreviewPanel :layout="opened.layout_json" />
      </template>
    </dialog>
  </aside>
</template>

<style scoped>
.versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  font-size: 13px;
}

.versions__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.versions__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.versions__message {
  margin: 0;
  color: var(--muted);
}

.versions__message.is-error {
  color: var(--red);
}

button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--blue);
  background: var(--blue-bg);
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.versions__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.version {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.version__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.version__number {
  font-weight: 600;
  color: var(--text);
}

.version__badge {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--input);
}

.version__badge.is-published {
  background: var(--green-bg);
  color: var(--green);
}

.version__summary {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}

.version__meta {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.version__actions {
  display: flex;
  gap: 6px;
}

.version__confirm {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--text);
  background: var(--blue-bg);
  border: 1px solid var(--blue);
  border-radius: var(--radius-card);
}

button.is-primary {
  color: var(--blue-soft);
  background: var(--blue-bg);
  border-color: var(--blue);
}

.versions__dialog-ask {
  font-size: 12px;
  color: var(--text);
}

.versions__dialog {
  width: min(900px, 95vw);
  max-height: 90vh;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
}

.versions__dialog::backdrop {
  background: rgba(0, 0, 0, 0.4);
}

.versions__dialog-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.versions__dialog-bar h3 {
  flex: 1;
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.versions__dialog-bar small {
  margin-left: 6px;
  font-weight: normal;
  color: var(--muted);
}

.versions__dialog-summary {
  margin: 0;
  padding: 8px 16px 0;
}
</style>
