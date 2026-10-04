<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getSmartPrintFormats } from '@/api/smartPrintApi'
import VersionPanel from '@/components/VersionPanel.vue'

const props = defineProps({
  name: { type: String, required: true },
})

const router = useRouter()

const spf = ref(null)
const error = ref(null)

watch(
  () => props.name,
  async (name) => {
    spf.value = null
    error.value = null
    try {
      const [doc] = await getSmartPrintFormats({ filters: [['name', '=', name]], limit: 1 })
      if (name !== props.name) return
      if (doc) spf.value = doc
      else error.value = `Smart Print Format “${name}” was not found.`
    } catch (err) {
      if (name === props.name) error.value = err.message
    }
  },
  { immediate: true },
)

function onRestored() {
  router.push({ name: 'designer', params: { name: props.name } })
}
</script>

<template>
  <div class="page">
    <nav class="page__nav">
      <RouterLink :to="{ name: 'dashboard' }">← All formats</RouterLink>
      <RouterLink v-if="spf" :to="{ name: 'designer', params: { name } }">Open designer</RouterLink>
    </nav>

    <p v-if="error" class="page__error" role="alert">{{ error }}</p>

    <template v-else>
      <header class="page__header">
        <h1>{{ spf?.title || name }}</h1>
        <p v-if="spf" class="page__meta">
          {{ spf.target_doctype }}
          <template v-if="spf.print_format"> · {{ spf.print_format }}</template>
          · {{ spf.status || 'Draft' }}
        </p>
      </header>

      <VersionPanel :name="name" @restored="onRestored" />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  font-size: 14px;
}

.page__nav {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page__nav a {
  color: var(--blue);
  text-decoration: none;
}

.page__nav a:hover {
  text-decoration: underline;
}

.page__header h1 {
  margin: 0;
  font-size: 22px;
  color: var(--text);
}

.page__meta {
  margin: 4px 0 0;
  color: var(--muted);
}

.page__error {
  color: var(--red);
}
</style>
