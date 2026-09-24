<script setup>
// Wraps every node on the canvas and shows its visibility rules:
// - props.condition: printed only when the condition is true
//   (e.g. "doc.status == 'Paid'"), evaluated at print time, not here
// - props.hidden:    never printed
//
// The canvas always shows the node so it can still be edited; the badge and
// dashed outline tell the user it may not appear on paper.
// Also marks the node's position for drop-index calculation (data-node-id).

import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const condition = computed(() => props.node.props?.condition?.trim() || '')
const hidden = computed(() => Boolean(props.node.props?.hidden))
</script>

<template>
  <div
    class="conditional"
    :class="{ 'is-conditional': condition, 'is-hidden': hidden }"
    :data-node-id="node.id"
  >
    <div v-if="hidden || condition" class="conditional__badges">
      <span v-if="hidden" class="conditional__badge">Hidden in print</span>
      <span v-if="condition" class="conditional__badge" :title="condition">
        Shown if: {{ condition }}
      </span>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.conditional {
  position: relative;
}

.conditional.is-conditional,
.conditional.is-hidden {
  outline: 1px dashed #c77c00;
  outline-offset: 2px;
}

.conditional.is-hidden > :not(.conditional__badges) {
  opacity: 0.45;
}

.conditional__badges {
  display: flex;
  gap: 4px;
  margin-bottom: 2px;
}

.conditional__badge {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  border-radius: 3px;
  background: #fff4e0;
  color: #8a5500;
  font: 10px/1.6 var(--sans);
}

/* Drop indicators, set by the parent list (see useDropList). */
.conditional.drop-before {
  box-shadow: 0 -3px 0 #7c3aed;
}

.conditional.drop-before-x {
  box-shadow: -3px 0 0 #7c3aed;
}
</style>
