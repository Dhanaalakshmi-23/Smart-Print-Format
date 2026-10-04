<script setup>
defineProps({
  label: { type: String, required: true },
  index: { type: Number, required: true },
  count: { type: Number, required: true },
  axis: { type: String, default: 'y' },
  movable: { type: Boolean, default: true },
})

defineEmits(['move', 'remove'])
</script>

<template>
  <div class="node-actions" @click.stop>
    <span class="node-actions__label">{{ label }}</span>
    <button
      v-if="movable"
      type="button"
      :disabled="index === 0"
      :aria-label="`Move ${label} ${axis === 'y' ? 'up' : 'left'}`"
      @click="$emit('move', -1)"
    >
      {{ axis === 'y' ? '↑' : '←' }}
    </button>
    <button
      v-if="movable"
      type="button"
      :disabled="index >= count - 1"
      :aria-label="`Move ${label} ${axis === 'y' ? 'down' : 'right'}`"
      @click="$emit('move', 1)"
    >
      {{ axis === 'y' ? '↓' : '→' }}
    </button>
    <button
      type="button"
      class="node-actions__delete"
      :aria-label="`Delete ${label}`"
      @click="$emit('remove')"
    >
      ✕
    </button>
  </div>
</template>

<style scoped>
.node-actions {
  position: absolute;
  top: -22px;
  right: -1px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-radius: 4px 4px 0 0;
  background: var(--blue);
  color: #fff;
  font: 11px/1.4 var(--sans);
  visibility: hidden;
}

:hover > .node-actions,
:focus-within > .node-actions {
  visibility: visible;
}

.node-actions__label {
  padding: 0 4px;
  text-transform: capitalize;
}

button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 3px;
  padding: 0 5px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.node-actions__delete:hover {
  background: var(--red) !important;
}
</style>
