<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createSmartPrintFormat, getSmartPrintFormats } from '@/api/smartPrintApi'
import { useDocTypeList } from '@/composables/useDoctypeMeta'
import { usePrintFormat } from '@/composables/usePrintFormat'
import { formatDateTime } from '@/utils/format'
import { createDefaultLayout } from '@/utils/layout'
import SearchSelect from '@/components/SearchSelect.vue'

const router = useRouter()

const formats = ref([])
const loading = ref(false)
const error = ref(null)
const search = ref('')
const statusFilter = ref('')

async function loadFormats() {
  loading.value = true
  error.value = null
  try {
    formats.value = await getSmartPrintFormats()
  } catch (err) {
    error.value = `Could not load Smart Print Formats: ${err.message}`
  } finally {
    loading.value = false
  }
}

onMounted(loadFormats)

const STATUSES = ['Draft', 'Active', 'Archived']

const visibleFormats = computed(() => {
  const query = search.value.trim().toLowerCase()
  return formats.value.filter(
    (spf) =>
      (!statusFilter.value || spf.status === statusFilter.value) &&
      (!query ||
        [spf.title, spf.name, spf.target_doctype, spf.print_format].some((value) =>
          value?.toLowerCase().includes(query),
        )),
  )
})

const openDesigner = (name) => router.push({ name: 'designer', params: { name } })

const createDialog = ref(null)
const form = ref({ title: '', target_doctype: '', print_format: '' })
const creating = ref(false)
const createError = ref(null)

const doctypeList = useDocTypeList()
const printFormat = usePrintFormat(() => form.value.target_doctype, null)

const doctypeOptions = computed(() =>
  doctypeList.doctypes.value.map((dt) => ({ value: dt.name, label: dt.name, hint: dt.module })),
)
const printFormatOptions = computed(() =>
  printFormat.printFormats.value.map((pf) => ({ value: pf.name, label: pf.name, hint: pf.print_format_type })),
)

function openCreate() {
  form.value = { title: '', target_doctype: '', print_format: '' }
  createError.value = null
  createDialog.value.showModal()
  doctypeList.load()
}

watch(
  () => form.value.target_doctype,
  () => (form.value.print_format = ''),
)

const canCreate = computed(
  () =>
    !creating.value &&
    form.value.title.trim() &&
    form.value.target_doctype &&
    form.value.print_format,
)

async function create() {
  if (!canCreate.value) return
  creating.value = true
  createError.value = null
  try {
    const doc = await createSmartPrintFormat({
      title: form.value.title.trim(),
      target_doctype: form.value.target_doctype,
      print_format: form.value.print_format,
      layout_json: createDefaultLayout(form.value.target_doctype),
    })
    createDialog.value.close()
    openDesigner(doc.name)
  } catch (err) {
    createError.value = err.message
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="dashboard">
    <header class="dashboard__header">
      <h1>Smart Print Formats</h1>
      <button type="button" class="is-primary" @click="openCreate">+ New</button>
    </header>

    <div class="dashboard__filters">
      <input
        v-model="search"
        type="search"
        placeholder="Search title, DocType or Print Format"
        aria-label="Search Smart Print Formats"
      />
      <select v-model="statusFilter" aria-label="Filter by status">
        <option value="">All statuses</option>
        <option v-for="status in STATUSES" :key="status" :value="status">{{ status }}</option>
      </select>
      <button type="button" :disabled="loading" @click="loadFormats">Reload</button>
    </div>

    <div v-if="error" class="dashboard__message is-error" role="alert">
      <p>{{ error }}</p>
      <button type="button" @click="loadFormats">Retry</button>
    </div>
    <p v-else-if="loading && !formats.length" class="dashboard__message">Loading…</p>
    <div v-else-if="!formats.length" class="dashboard__message">
      <p>No Smart Print Formats yet.</p>
      <button type="button" class="is-primary" @click="openCreate">Create the first one</button>
    </div>
    <p v-else-if="!visibleFormats.length" class="dashboard__message">
      No Smart Print Formats match these filters.
    </p>

    <div v-else class="dashboard__table-wrap">
      <table class="dashboard__table">
        <thead>
          <tr>
            <th>Title</th>
            <th>DocType</th>
            <th>Print Format</th>
            <th>Status</th>
            <th>Version</th>
            <th>Last modified</th>
            <th><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="spf in visibleFormats" :key="spf.name">
            <td>
              <RouterLink :to="{ name: 'designer', params: { name: spf.name } }" class="dashboard__title">
                {{ spf.title || spf.name }}
              </RouterLink>
              <span class="dashboard__name">{{ spf.name }}</span>
            </td>
            <td>{{ spf.target_doctype }}</td>
            <td>{{ spf.print_format || '—' }}</td>
            <td>
              <span class="status" :class="`is-${(spf.status || 'draft').toLowerCase()}`">
                {{ spf.status || 'Draft' }}
              </span>
            </td>
            <td>v{{ spf.version ?? 1 }}</td>
            <td class="dashboard__muted">{{ formatDateTime(spf.modified) }}</td>
            <td class="dashboard__actions">
              <RouterLink :to="{ name: 'designer', params: { name: spf.name } }">Open</RouterLink>
              <RouterLink :to="{ name: 'versions', params: { name: spf.name } }">Versions</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <dialog ref="createDialog" class="dashboard__dialog" aria-labelledby="create-title">
      <form class="create" @submit.prevent="create">
        <h2 id="create-title">New Smart Print Format</h2>

        <label>
          <span>Title</span>
          <input v-model="form.title" type="text" required autofocus />
        </label>

        <div class="create__field">
          <span>DocType</span>
          <SearchSelect
            v-model="form.target_doctype"
            :options="doctypeOptions"
            :loading="doctypeList.loading.value"
            :error="doctypeList.error.value"
            label="DocType"
            placeholder="Select DocType"
            @open="doctypeList.load()"
          />
        </div>

        <div class="create__field">
          <span>Print Format</span>
          <SearchSelect
            v-model="form.print_format"
            :options="printFormatOptions"
            :loading="printFormat.loading.value"
            :error="printFormat.error.value"
            :disabled="!form.target_doctype"
            :empty-text="`No Print Formats for ${form.target_doctype}`"
            label="Print Format"
            placeholder="Select Print Format"
            tone="orange"
          />
        </div>

        <p v-if="createError" class="dashboard__message is-error" role="alert">{{ createError }}</p>

        <div class="create__actions">
          <button type="button" @click="createDialog.close()">Cancel</button>
          <button type="submit" class="is-primary" :disabled="!canCreate">
            {{ creating ? 'Creating…' : 'Create and open' }}
          </button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px;
  font-size: 14px;
}

.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.dashboard__header h1 {
  margin: 0;
  font-size: 22px;
  color: var(--text);
}

.dashboard__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.dashboard__filters input {
  flex: 1 1 240px;
}

input,
select,
button {
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  box-sizing: border-box;
  min-width: 0;
}

button {
  cursor: pointer;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

button.is-primary {
  color: #fff;
  background: var(--blue);
  border-color: var(--blue);
}

.dashboard__message {
  margin: 24px 0;
  color: var(--muted);
}

.dashboard__message p {
  margin: 0 0 8px;
}

.dashboard__message.is-error {
  color: var(--red);
}

.dashboard__table-wrap {
  overflow-x: auto;
}

.dashboard__table {
  width: 100%;
  border-collapse: collapse;
}

.dashboard__table th,
.dashboard__table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.dashboard__table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}

.dashboard__table tbody tr:hover {
  background: var(--blue-bg);
}

.dashboard__title {
  display: block;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.dashboard__title:hover {
  text-decoration: underline;
}

.dashboard__name,
.dashboard__muted {
  font-size: 12px;
  color: var(--muted);
}

.dashboard__actions {
  white-space: nowrap;
}

.dashboard__actions a {
  color: var(--blue);
  text-decoration: none;
}

.dashboard__actions a + a {
  margin-left: 12px;
}

.dashboard__actions a:hover {
  text-decoration: underline;
}

.status {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
  background: var(--input);
}

.status.is-active {
  background: var(--green-bg);
  color: var(--green);
}

.status.is-archived {
  background: var(--input);
  color: var(--muted);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.dashboard__dialog {
  width: min(420px, calc(100vw - 32px));
  overflow: visible;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--muted);
}

.dashboard__dialog::backdrop {
  background: rgba(0, 0, 0, 0.4);
}

.create {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.create h2 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.create label,
.create__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.create__field :deep(.select__button) {
  max-width: none;
  width: 100%;
}

.create__field :deep(.select__value) {
  text-align: left;
}

.create .dashboard__message {
  margin: 0;
}

.create__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
