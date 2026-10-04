<script setup>
import { computed } from 'vue'
import { useDesigner } from '@/composables/useDesigner'

const props = defineProps({
  node: { type: Object, required: true },
})

const condition = computed(() => props.node.props?.condition?.trim() || '')
const hidden = computed(() => Boolean(props.node.props?.hidden))

const { invalidIds } = useDesigner()
const invalid = computed(() => invalidIds.value.has(props.node.id))
</script>

<template>
  <div
    class="conditional"
    :class="{ 'is-conditional': condition, 'is-hidden': hidden, 'is-invalid': invalid }"
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
  outline: 1px dashed var(--orange);
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
  background: var(--orange-bg);
  color: var(--orange);
  font: 10px/1.6 var(--sans);
}

.conditional.is-invalid {
  outline: 2px solid var(--red);
  outline-offset: 1px;
  border-radius: 4px;
}

.conditional.drop-before {
  box-shadow: 0 -3px 0 var(--blue);
}

.conditional.drop-before-x {
  box-shadow: -3px 0 0 var(--blue);
}
</style>
