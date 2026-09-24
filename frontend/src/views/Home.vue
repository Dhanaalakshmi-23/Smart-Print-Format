<script setup>
// `/?spf=SPF-00001` opens that Smart Print Format; without it the designer
// starts with whatever is in the store (a new, empty format by default).

import { useRoute } from 'vue-router'
import SmartPrintDesigner from '@/components/SmartPrintDesigner.vue'

const route = useRoute()
</script>

<template>
  <SmartPrintDesigner :name="route.query.spf || null" />
</template>
