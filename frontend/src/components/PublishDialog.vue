<script setup>
import { computed, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'
import { useToast } from '@/composables/useToast'
import { searchDocuments } from '@/api/smartPrintApi'

const store = useSmartPrintStore()
const { publish, publishDialogOpen, selectNode } = useDesigner()
const toast = useToast()

const dialog = ref(null)
const state = ref('form')
const summary = ref('')
const errorMessage = ref('')
const issues = ref([])
const sample = ref(null)
const sampleLoading = ref(false)

watch(publishDialogOpen, (open) => {
  const el = dialog.value
  if (!el) return
  if (open) {
    state.value = 'form'
    summary.value = ''
    errorMessage.value = ''
    issues.value = []
    if (!el.open) el.showModal()
  } else if (el.open) {
    el.close()
  }
})

function close() {
  publishDialogOpen.value = false
}

async function onPublish() {
  state.value = 'publishing'
  const result = await publish(summary.value.trim())
  if (result.ok) {
    state.value = 'done'
    toast.success(`Published · version ${store.currentSPF?.version ?? ''}`.trim())
    loadSample()
  } else if (result.validation) {
    issues.value = result.validation.errors
    state.value = 'invalid'
  } else {
    errorMessage.value = result.error || 'Publishing failed.'
    state.value = 'error'
  }
}

function selectIssue(issue) {
  if (!issue.nodeId) return
  selectNode(issue.nodeId)
  close()
}

async function loadSample() {
  sample.value = null
  sampleLoading.value = true
  try {
    const [first] = await searchDocuments(store.targetDoctype, '', { limit: 1 })
    sample.value = first || null
  } catch {
    sample.value = null
  } finally {
    sampleLoading.value = false
  }
}

const printQuery = computed(() => {
  if (!sample.value) return ''
  const params = new URLSearchParams({
    doctype: store.targetDoctype,
    name: sample.value.name,
    format: store.currentSPF?.print_format || '',
  })
  return params.toString()
})
const printUrl = computed(() => (printQuery.value ? `/printview?${printQuery.value}` : ''))
const pdfUrl = computed(() =>
  printQuery.value ? `/api/method/frappe.utils.print_format.download_pdf?${printQuery.value}` : '',
)
</script>

<template>
  <dialog ref="dialog" class="publish" aria-label="Publish format" @close="close">
    <form v-if="state === 'form' || state === 'publishing'" class="publish__body" @submit.prevent="onPublish">
      <h2 class="publish__title">Publish Format</h2>
      <p class="publish__text">
        Validates the layout, writes it to the Print Format
        <strong>{{ store.currentSPF?.print_format || '(created on publish)' }}</strong>
        and records a published version.
      </p>
      <label class="publish__field">
        <span>Change summary <small>(optional)</small></span>
        <textarea
          v-model="summary"
          rows="3"
          placeholder="e.g. Added tax table and signature"
          :disabled="state === 'publishing'"
          @keydown.ctrl.enter.prevent="onPublish"
          @keydown.meta.enter.prevent="onPublish"
        />
      </label>
      <div class="publish__actions">
        <button type="button" :disabled="state === 'publishing'" @click="close">Cancel</button>
        <button type="submit" class="is-green" :disabled="state === 'publishing'">
          {{ state === 'publishing' ? 'Publishing…' : '↑ Publish' }}
        </button>
      </div>
    </form>

    <div v-else-if="state === 'invalid'" class="publish__body">
      <h2 class="publish__title is-error">Fix these errors first</h2>
      <p class="publish__text">Nothing was published. Click an error to select its element.</p>
      <ul class="publish__issues">
        <li v-for="(issue, i) in issues" :key="i">
          <button type="button" :disabled="!issue.nodeId" @click="selectIssue(issue)">
            <strong>{{ issue.location }}</strong> {{ issue.message }}
          </button>
        </li>
      </ul>
      <div class="publish__actions">
        <button type="button" @click="close">Close</button>
      </div>
    </div>

    <div v-else-if="state === 'error'" class="publish__body">
      <h2 class="publish__title is-error">Could not publish</h2>
      <p class="publish__text is-error" role="alert">{{ errorMessage }}</p>
      <div class="publish__actions">
        <button type="button" @click="close">Close</button>
        <button type="button" class="is-green" @click="state = 'form'">Try again</button>
      </div>
    </div>

    <div v-else class="publish__body">
      <h2 class="publish__title is-ok">Published</h2>
      <p class="publish__text">
        Print Format <strong>{{ store.currentSPF?.print_format }}</strong> now prints version
        {{ store.currentSPF?.version }}.
      </p>
      <p v-if="sampleLoading" class="publish__text">Looking for a sample {{ store.targetDoctype }}…</p>
      <p v-else-if="sample" class="publish__links">
        <a :href="printUrl" target="_blank" rel="noopener">Open print preview of {{ sample.name }} ↗</a>
        <a :href="pdfUrl" target="_blank" rel="noopener">PDF ↗</a>
      </p>
      <p v-else class="publish__text">
        No {{ store.targetDoctype }} documents yet. Create one to see the printed result.
      </p>
      <div class="publish__actions">
        <button type="button" class="is-green" @click="close">Done</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.publish {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow);
}

.publish::backdrop {
  background: rgba(0, 0, 0, 0.3);
}

.publish__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  font-size: 12px;
}

.publish__title {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

.publish__title.is-error {
  color: var(--red);
}

.publish__title.is-ok {
  color: var(--green);
}

.publish__text {
  color: var(--muted);
  overflow-wrap: anywhere;
}

.publish__text strong {
  color: var(--orange);
  font-weight: 600;
}

.publish__text.is-error {
  color: var(--red);
}

.publish__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--muted);
}

.publish__field small {
  color: var(--muted);
}

textarea {
  padding: 6px 8px;
  font: 12px var(--sans);
  color: var(--text);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  resize: vertical;
}

textarea:focus {
  border-color: var(--blue);
  outline: none;
}

.publish__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

button {
  height: 26px;
  padding: 0 12px;
  font: 12px var(--sans);
  color: var(--text);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--muted);
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.is-green {
  color: var(--green);
  background: var(--green-bg);
  border-color: var(--green);
}

.publish__issues {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
}

.publish__issues button {
  width: 100%;
  height: auto;
  padding: 4px 6px;
  text-align: left;
  color: var(--red);
  background: none;
  border: none;
}

.publish__issues button:hover:not(:disabled) {
  background: var(--input);
}

.publish__issues button:disabled {
  opacity: 1;
  cursor: default;
}

.publish__issues strong {
  color: var(--text);
  font-weight: 600;
}

.publish__links {
  display: flex;
  gap: 16px;
}

.publish__links a {
  color: var(--blue-soft);
}
</style>
