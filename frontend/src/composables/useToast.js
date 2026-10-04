import { ref } from 'vue'

const toasts = ref([])
let nextId = 1

function dismiss(id) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

function show({ tone = 'info', message, link = null, timeout } = {}) {
  const id = nextId++
  toasts.value = [...toasts.value.slice(-3), { id, tone, message, link }]
  const ms = timeout ?? (tone === 'error' ? 0 : 3500)
  if (ms) setTimeout(() => dismiss(id), ms)
  return id
}

export function useToast() {
  return {
    toasts,
    show,
    dismiss,
    success: (message, options = {}) => show({ ...options, tone: 'ok', message }),
    error: (message, options = {}) => show({ ...options, tone: 'error', message }),
    info: (message, options = {}) => show({ ...options, tone: 'info', message }),
  }
}
