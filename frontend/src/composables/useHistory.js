// Snapshot-based undo/redo.
//
// The history doesn't know what it stores or how to apply it: callers push a
// snapshot after every change, and apply whatever undo()/redo() return.
//
//   const history = useHistory()
//   history.reset(store.layoutJson)           // after loading a document
//   history.push(store.layoutJson)            // after each edit
//   const layout = history.undo()             // then: store.setLayout(layout)
//
// Snapshots are kept as JSON strings: they can't be mutated by later edits,
// comparing two of them is a cheap string check, and every undo/redo returns
// a fresh object that is safe to hand to reactive state.

import { computed, ref } from 'vue'

const serialize = (snapshot) => JSON.stringify(snapshot)
const deserialize = (json) => (json === null ? null : JSON.parse(json))

export function useHistory({ limit = 100 } = {}) {
  const past = ref([]) // older snapshots, most recent last
  const future = ref([]) // undone snapshots, most recent last
  let present = null // snapshot currently shown

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // Start a fresh history from `snapshot` (e.g. after loading a document).
  function reset(snapshot = null) {
    past.value = []
    future.value = []
    present = snapshot === null ? null : serialize(snapshot)
  }

  // Record the state *after* a change.
  function push(snapshot) {
    const next = serialize(snapshot)
    if (next === present) return // nothing actually changed

    if (present !== null) {
      past.value.push(present)
      if (past.value.length > limit) past.value.shift()
    }
    present = next
    future.value = [] // a new change makes the undone steps unreachable
  }

  // Step back; returns the snapshot to apply, or null if there's nothing to undo.
  function undo() {
    if (!canUndo.value) return null
    future.value.push(present)
    present = past.value.pop()
    return deserialize(present)
  }

  // Step forward again; returns the snapshot to apply, or null.
  function redo() {
    if (!canRedo.value) return null
    past.value.push(present)
    present = future.value.pop()
    return deserialize(present)
  }

  return { push, undo, redo, reset, canUndo, canRedo }
}
