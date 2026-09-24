<script setup>
// Text that turns into an input on double-click. Emits `commit` with the new
// value on Enter or blur; Esc cancels.

import { nextTick, ref } from 'vue'

const props = defineProps({
  value: { type: String, default: '' },
  placeholder: { type: String, default: '' },
})

const emit = defineEmits(['commit'])

const editing = ref(false)
const draft = ref('')
const input = ref(null)

async function start() {
  draft.value = props.value
  editing.value = true
  await nextTick() // wait for the <input> to exist
  input.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const value = draft.value.trim()
  if (value !== props.value) emit('commit', value)
}

function cancel() {
  editing.value = false
}
</script>

<template>
  <input
    v-if="editing"
    ref="input"
    v-model="draft"
    class="inline-edit__input"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
    @click.stop
  />
  <span
    v-else
    class="inline-edit"
    :class="{ 'is-empty': !value }"
    title="Double-click to rename"
    @dblclick.stop="start"
  >
    {{ value || placeholder }}
  </span>
</template>

<style scoped>
.inline-edit {
  cursor: text;
}

.inline-edit.is-empty {
  color: #8d99a6;
  font-style: italic;
}

.inline-edit__input {
  font: inherit;
  color: inherit;
  width: 100%;
  box-sizing: border-box;
  padding: 0 2px;
  border: 1px solid #7c3aed;
  border-radius: 3px;
  background: #fff;
}
</style>
