<script setup>
// Version history of the open Smart Print Format (Smart Print Format
// Version records, newest first). A version can be opened to preview its
// layout, or restored as the working draft.
//
// Restoring copies the version's content into the Smart Print Format on the
// server (restoreVersion), then reloads the document into the designer. The
// version records themselves are never changed.
//
// Usage:
//   <VersionPanel />

import { computed, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { getVersion, getVersions, restoreVersion } from '@/api/smartPrintApi'
import PreviewPanel from './PreviewPanel.vue'

const store = useSmartPrintStore()
const spfName = computed(() => store.currentSPF?.name || null)

const versions = ref([])
const loading = ref(false)
const error = ref(null)

// ---- Loading the list ----

// Guards against an older, slower request overwriting a newer one.
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

// Publishing creates a version; pick it up once the publish succeeds.
// Subscriptions made in setup() end when the component unmounts.
store.$onAction(({ name, after }) => {
  if (name === 'publish') after(loadVersions)
})

// ---- Formatting ----

// Frappe sends "2026-09-24 10:15:00.123456" in the site's timezone.
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

// ---- Opening a version ----

const dialog = ref(null)
const opened = ref(null) // full version doc, layout_json parsed
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

// ---- Restoring ----

const restoring = ref(false)

async function restore(version) {
  const unsaved = store.isDirty
    ? '\n\nYou have unsaved changes. They will be lost.'
    : ''
  const ok = window.confirm(
    `Restore version ${version.version_number}?\n\n` +
      'Its layout replaces the current draft of this Smart Print Format. ' +
      'The published print format does not change until you publish again.' +
      unsaved,
  )
  if (!ok) return

  restoring.value = true
  error.value = null
  try {
    await restoreVersion(version.name)
    // Reload so the designer shows the restored layout. This also resets
    // undo history: the server already holds the restored draft.
    await store.load(spfName.value)
    if (store.status === 'error') throw new Error(store.error)
    close()
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

        <div class="version__actions">
          <button
            type="button"
            :disabled="openingName === version.name"
            @click="open(version)"
          >
            {{ openingName === version.name ? 'Opening…' : 'Open' }}
          </button>
          <button type="button" :disabled="busy" @click="restore(version)">Restore</button>
        </div>
      </li>
    </ul>

    <!-- Read-only look at a version before restoring it. -->
    <dialog ref="dialog" class="versions__dialog" @close="opened = null">
      <template v-if="opened">
        <header class="versions__dialog-bar">
          <h3>
            Version {{ opened.version_number }}
            <small>{{ formatDate(opened.created_on) }}</small>
          </h3>
          <button type="button" :disabled="busy" @click="restore(opened)">
            {{ restoring ? 'Restoring…' : 'Restore this version' }}
          </button>
          <button type="button" @click="close">Close</button>
        </header>
        <!-- The sidebar's error is hidden behind the modal, so repeat it here. -->
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
  color: var(--text);
}

.versions__message.is-error {
  color: #d9383a;
}

button {
  font: inherit;
  color: var(--text-h);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--accent-border);
  background: var(--accent-bg);
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
  color: var(--text-h);
}

.version__badge {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--code-bg);
}

.version__badge.is-published {
  background: #dcfce7;
  color: #166534;
}

.version__summary {
  margin: 0;
  color: var(--text-h);
  overflow-wrap: anywhere;
}

.version__meta {
  margin: 0;
  font-size: 11px;
  color: var(--text);
  overflow-wrap: anywhere;
}

.version__actions {
  display: flex;
  gap: 6px;
}

.versions__dialog {
  width: min(900px, 95vw);
  max-height: 90vh;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
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
  color: var(--text-h);
}

.versions__dialog-bar small {
  margin-left: 6px;
  font-weight: normal;
  color: var(--text);
}

.versions__dialog-summary {
  margin: 0;
  padding: 8px 16px 0;
}
</style>
