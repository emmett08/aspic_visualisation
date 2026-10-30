<script setup lang="ts">
import { computed } from 'vue'
import { computationStatusText, exactComputationQuantities } from '../domain/computation'
import type { ComputationResult } from '../domain/computation'

const props = defineProps<{ computation: ComputationResult }>()
const exactQuantities = computed(() => exactComputationQuantities(props.computation))
</script>

<template>
  <section class="detail-section computation-result" aria-label="Recorded computation">
    <h4>Recorded computation</h4>
    <dl class="compact-dl">
      <dt>Method</dt><dd>{{ computation.method }}</dd>
      <dt>Method result</dt><dd>{{ computationStatusText[computation.status] }}</dd>
    </dl>
    <p v-if="computation.method === 'structured/1'" class="small-note">
      This method retains authored structured support. It supplies no formal proof.
    </p>
    <p v-else class="small-note">
      This result concerns the declared method and its supplied inputs. Premise truth,
      prose correspondence and applicability have separate evidence obligations.
    </p>
    <ul v-if="computation.reasons.length" aria-label="Recorded computation reasons">
      <li v-for="(reason, index) in computation.reasons" :key="index">{{ reason }}</li>
    </ul>
    <dl v-if="exactQuantities.length" class="compact-dl" aria-label="Exact computation quantities">
      <template v-for="quantity in exactQuantities" :key="quantity.name">
        <dt>{{ quantity.name }}</dt><dd>{{ quantity.value }} <span class="muted">[{{ quantity.unit }}]</span></dd>
      </template>
    </dl>
    <details class="raw-details">
      <summary>Method-specific result details</summary>
      <pre>{{ JSON.stringify(computation.details, null, 2) }}</pre>
    </details>
    <p class="small-note">Supplied computation metadata; the browser does not rerun this method.</p>
  </section>
</template>
