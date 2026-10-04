<script setup>
import { computed, ref, watch } from 'vue'
import { useSmartPrintStore } from '@/stores/smartPrintStore'
import { useDesigner } from '@/composables/useDesigner'

const preview = defineModel('preview', { type: Boolean, default: false })
const history = defineModel('history', { type: Boolean, default: false })

const store = useSmartPrintStore()
const { validation, validating, validate, save, openPublish, selectNode, isWorking } = useDesigner()

const showIssues = ref(false)
const issues = computed(() =>
  validation.value ? [...validation.value.errors, ...validation.value.warnings] : [],
)

async function onValidate() {
  const result = await validate()
  showIssues.value = result.errors.length + result.warnings.length > 0
}

function onSave() {
  save()
}

function onPublish() {
  openPublish()
}

watch(validation, (result) => {
  if (!result) showIssues.value = false
  else if (result.errors.length) showIssues.value = true
})

function selectIssue(issue) {
  if (issue.nodeId) selectNode(issue.nodeId)
}

const status = computed(() => {
  if (store.status === 'error') return { tone: 'error', text: store.error }
  if (store.status === 'loading') return { tone: 'muted', text: 'Loading…' }
  if (store.status === 'saving') return { tone: 'muted', text: 'Saving…' }
  if (store.status === 'publishing') return { tone: 'muted', text: 'Publishing…' }
  if (validating.value) return { tone: 'muted', text: 'Validating…' }
  if (validation.value) {
    const { errors, warnings } = validation.value
    if (errors.length) return { tone: 'error', text: plural(errors.length, 'validation error') }
    if (warnings.length) return { tone: 'warning', text: `Valid · ${plural(warnings.length, 'warning')}` }
    return { tone: 'ok', text: 'Layout is valid' }
  }
  return null
})

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
</script>

<template>
  <footer class="actions">
    <ul v-if="showIssues && issues.length" class="actions__issues" aria-label="Validation results">
      <li v-for="(issue, i) in issues" :key="i" :class="`is-${issue.level}`">
        <button type="button" :disabled="!issue.nodeId" @click="selectIssue(issue)">
          <strong>{{ issue.location }}</strong> {{ issue.message }}
        </button>
      </li>
    </ul>

    <p v-if="status" class="actions__notice" :class="`is-${status.tone}`" role="status">
      <button
        v-if="issues.length"
        type="button"
        class="actions__toggle"
        :aria-expanded="showIssues"
        @click="showIssues = !showIssues"
      >
        {{ status.text }} {{ showIssues ? '▾' : '▸' }}
      </button>
      <template v-else>{{ status.text }}</template>
    </p>

    <div class="actions__bar">
      <button type="button" :disabled="isWorking" @click="onValidate">✅ Validate</button>
      <button
        type="button"
        :disabled="isWorking || (!store.isDirty && !store.isNew)"
        @click="onSave"
      >
        💾 Save<span
          v-if="store.isDirty || store.isNew"
          class="actions__dot"
          :title="store.isNew ? 'Not saved yet' : 'Unsaved changes'"
          aria-label="Unsaved changes"
        />
      </button>
      <button
        type="button"
        class="is-blue"
        :class="{ 'is-active': preview }"
        :aria-pressed="preview"
        @click="preview = !preview"
      >
        👁 Live Preview
      </button>
      <button type="button" class="is-green" :disabled="isWorking" @click="onPublish">
        ↑ Publish Format
      </button>
      <button type="button" :class="{ 'is-active': history }" :aria-pressed="history" @click="history = !history">
        📦 Versions
      </button>

    </div>
  </footer>
</template>

<style scoped>
.actions {
  background: var(--bg);
}

.actions__bar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 12px;
  padding: 2px 4px 4px;
}

button {
  flex-shrink: 0;
  min-width: 96px;
  height: 16px;
  padding: 0 8px;
  font: 10px/1 var(--sans);
  color: var(--text);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: var(--muted);
}

button:disabled {
  cursor: not-allowed;
}

button.is-active {
  background: var(--blue-bg);
  border-color: var(--blue);
}

button.is-blue {
  min-width: 112px;
  color: var(--blue-soft);
  background: var(--blue-bg);
  border-color: var(--blue);
}

button.is-green {
  min-width: 112px;
  color: var(--green);
  background: var(--green-bg);
  border-color: var(--green);
}

.actions__dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-left: 5px;
  vertical-align: middle;
  border-radius: 50%;
  background: var(--orange);
}

.actions__notice {
  padding: 2px 6px;
  font-size: 11px;
  color: var(--muted);
}

.actions__notice.is-error {
  color: var(--red);
}

.actions__notice.is-warning {
  color: var(--orange);
}

.actions__notice.is-ok {
  color: var(--green);
}

.actions__toggle {
  min-width: 0;
  height: auto;
  padding: 0;
  font-size: 11px;
  color: inherit;
  background: none;
  border: none;
}

.actions__issues {
  list-style: none;
  margin: 0;
  padding: 6px 12px;
  max-height: 160px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border);
}

.actions__issues button {
  width: 100%;
  height: auto;
  font-size: 11px;
  text-align: left;
  background: none;
  border: none;
  padding: 2px 4px;
}

.actions__issues button:hover:not(:disabled) {
  background: var(--input);
}

.actions__issues button:disabled {
  opacity: 1;
  cursor: default;
}

.actions__issues .is-error {
  color: var(--red);
}

.actions__issues .is-warning {
  color: var(--orange);
}

.actions__issues strong {
  color: var(--text);
  font-weight: 600;
}
</style>
