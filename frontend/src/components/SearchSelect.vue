<script setup>
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Select' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  emptyText: { type: String, default: 'No options' },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  tone: { type: String, default: 'blue' },
  label: { type: String, default: '' },
  remote: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'open', 'search'])

const open = ref(false)
const query = ref('')
const active = ref(0)
const root = ref(null)
const search = ref(null)
const list = ref(null)

const MAX_SHOWN = 200

const filtered = computed(() => {
  if (props.remote) return props.options.slice(0, MAX_SHOWN)
  const q = query.value.trim().toLowerCase()
  const matches = q
    ? props.options.filter(
        (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
      )
    : props.options
  return matches.slice(0, MAX_SHOWN)
})

const current = computed(() => props.options.find((o) => o.value === props.modelValue))

watch(query, (q) => props.remote && open.value && emit('search', q.trim()))

async function toggle() {
  if (props.disabled) return
  if (open.value) return close()
  open.value = true
  query.value = ''
  emit('open')
  if (props.remote) emit('search', '')
  await nextTick()
  active.value = Math.max(0, filtered.value.findIndex((o) => o.value === props.modelValue))
  search.value?.focus()
  scrollToActive()
}

function close() {
  open.value = false
}

function pick(option) {
  if (!option) return
  close()
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
}

function move(delta) {
  const count = filtered.value.length
  if (!count) return
  active.value = (active.value + delta + count) % count
  scrollToActive()
}

function scrollToActive() {
  nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }))
}

function onFocusout(event) {
  if (!root.value?.contains(event.relatedTarget)) close()
}
</script>

<template>
  <div ref="root" class="select" :class="[`is-${tone}`, { 'is-open': open }]" @focusout="onFocusout">
    <button
      type="button"
      class="select__button"
      :class="{ 'is-invalid': invalid, 'is-empty': !modelValue }"
      :disabled="disabled"
      :aria-label="label || undefined"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="toggle"
      @keydown.down.prevent="!open && toggle()"
    >
      <span class="select__value">{{ current?.label || modelValue || placeholder }}</span>
    </button>

    <div v-if="open" class="select__popover">
      <input
        ref="search"
        v-model="query"
        class="select__search"
        type="search"
        placeholder="Search…"
        :aria-label="`Search ${label}`"
        @input="active = 0"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pick(filtered[active])"
        @keydown.esc.prevent="close"
      />

      <p v-if="loading && !options.length" class="select__message">Loading…</p>
      <p v-else-if="error" class="select__message is-error">{{ error }}</p>
      <p v-else-if="!filtered.length" class="select__message">
        {{ options.length ? `No match for “${query}”` : emptyText }}
      </p>

      <ul v-else ref="list" class="select__list" role="listbox" :aria-label="label">
        <li
          v-for="(option, i) in filtered"
          :key="option.value"
          role="option"
          :aria-selected="option.value === modelValue"
          :class="{ 'is-active': i === active, 'is-selected': option.value === modelValue }"
          @mousedown.prevent="pick(option)"
          @mousemove="active = i"
        >
          <span class="select__label">{{ option.label }}</span>
          <span v-if="option.hint" class="select__hint">{{ option.hint }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.select {
  position: relative;
  --tone: var(--blue-soft);
}

.select.is-orange {
  --tone: var(--orange);
}

.select__button {
  display: flex;
  align-items: center;
  width: 166px;
  height: 26px;
  padding: 0 10px;
  font: 13px var(--sans);
  color: var(--tone);
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  cursor: pointer;
}

.select__button:hover:not(:disabled),
.select.is-open .select__button {
  border-color: var(--tone);
}

.select__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.select__button.is-empty {
  color: var(--muted);
}

.select__button.is-invalid {
  border-color: var(--red);
}

.select__value {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.select__popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  width: max(100%, 280px);
  padding: 6px;
  box-sizing: border-box;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.select__search {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  font: inherit;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.select__message {
  padding: 8px 4px 4px;
  color: var(--muted);
}

.select__message.is-error {
  color: var(--red);
}

.select__list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}

.select__list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text);
}

.select__list li.is-active {
  background: var(--blue-bg);
}

.select__list li.is-selected .select__label {
  color: var(--tone);
  font-weight: 600;
}

.select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select__hint {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 11px;
}
</style>
