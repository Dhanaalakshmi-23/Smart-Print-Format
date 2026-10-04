import { computed, ref } from 'vue'

const serialize = (snapshot) => JSON.stringify(snapshot)
const deserialize = (json) => (json === null ? null : JSON.parse(json))

export function useHistory({ limit = 100 } = {}) {
  const past = ref([])
  const future = ref([])
  let present = null

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function reset(snapshot = null) {
    past.value = []
    future.value = []
    present = snapshot === null ? null : serialize(snapshot)
  }

  function push(snapshot) {
    const next = serialize(snapshot)
    if (next === present) return

    if (present !== null) {
      past.value.push(present)
      if (past.value.length > limit) past.value.shift()
    }
    present = next
    future.value = []
  }

  function undo() {
    if (!canUndo.value) return null
    future.value.push(present)
    present = past.value.pop()
    return deserialize(present)
  }

  function redo() {
    if (!canRedo.value) return null
    past.value.push(present)
    present = future.value.pop()
    return deserialize(present)
  }

  return { push, undo, redo, reset, canUndo, canRedo }
}
