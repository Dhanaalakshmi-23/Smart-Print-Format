<script setup>
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="`is-${toast.tone}`" role="status">
      <span class="toast__message">{{ toast.message }}</span>
      <a v-if="toast.link" class="toast__link" :href="toast.link.href" target="_blank" rel="noopener">
        {{ toast.link.label }}
      </a>
      <button type="button" class="toast__close" aria-label="Dismiss" @click="dismiss(toast.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 16px;
  bottom: 40px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: min(360px, calc(100vw - 32px));
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 12px;
  font: 12px var(--sans);
  color: var(--text);
  background: var(--panel);
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
}

.toast.is-ok {
  border-color: var(--green);
  background: var(--green-bg);
}

.toast.is-error {
  border-color: var(--red);
  background: var(--panel);
}

.toast.is-info {
  border-color: var(--blue);
  background: var(--blue-bg);
}

.toast__message {
  flex: 1;
  overflow-wrap: anywhere;
}

.toast__link {
  color: var(--blue-soft);
  white-space: nowrap;
}

.toast__close {
  width: 20px;
  height: 20px;
  padding: 0;
  font: 14px/1 var(--sans);
  color: var(--muted);
  background: none;
  border: none;
  cursor: pointer;
}

.toast__close:hover {
  color: var(--text);
}
</style>
