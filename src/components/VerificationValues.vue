<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '../domain/computation'
import { exactVerificationQuantities } from '../domain/verification'

const props = defineProps<{ details: Record<string, JsonValue> }>()
const quantities = computed(() => exactVerificationQuantities(props.details))
</script>

<template>
  <dl v-if="quantities.length" class="compact-dl" aria-label="Exact verification quantities">
    <template v-for="quantity in quantities" :key="quantity.path">
      <dt>{{ quantity.path }}</dt><dd>{{ quantity.value }} <span class="muted">[{{ quantity.unit }}]</span></dd>
    </template>
  </dl>
  <pre>{{ JSON.stringify(details, null, 2) }}</pre>
</template>
