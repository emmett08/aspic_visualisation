<script setup lang="ts">
import type { RecordedVerification } from '../domain/verification'
import { verificationExecutionText, verificationModeText, verificationStatusText } from '../domain/verification'
import VerificationValues from './VerificationValues.vue'

defineProps<{ reports: RecordedVerification[] }>()
</script>

<template>
  <section class="verification-reports" aria-label="Recorded verification obligations">
    <h3>Verification obligations</h3>
    <p v-if="!reports.length" class="verification-note">
      <strong data-verification-status="unknown">Verification not supplied.</strong>
      Source-to-formula coverage and applicability remain unassessed in this snapshot.
    </p>
    <p v-else class="verification-note">
      Recorded runtime checks are separate from authored status and graph acceptance.
      A pass covers the reported source obligations; inference results remain separate.
      Unknown means an obligation remains unresolved. Supplied records are not authenticated by this browser.
    </p>
    <details v-for="(entry, index) in reports" :key="index" class="verification-report">
      <summary>
        <span>{{ entry.argument_name }} · {{ entry.report?.target_id ?? 'No verification report' }}</span>
        <strong :data-verification-status="entry.report?.status ?? 'unknown'">{{ entry.report ? verificationStatusText[entry.report.status] : verificationExecutionText[entry.method_status] }}</strong>
        <span v-if="entry.report" class="verification-run-state"> · verifier {{ verificationExecutionText[entry.method_status].toLowerCase() }}</span>
      </summary>
      <dl class="compact-dl">
        <dt>Target / argument</dt><dd>{{ entry.argument_name }}</dd>
        <dt>Report source</dt><dd>{{ entry.source === 'native_method' ? 'EAL native method' : 'EngArg assurance after native replay' }}</dd>
      </dl>
      <p class="verification-note">Verifier execution: {{ verificationExecutionText[entry.method_status] }}.</p>
      <ul v-if="entry.reasons.length"><li v-for="(reason, reasonIndex) in entry.reasons" :key="reasonIndex">{{ reason }}</li></ul>
      <p v-if="!entry.report" class="verification-note">No obligation results were produced. This does not establish that the target was verified.</p>
      <template v-if="entry.report">
      <dl class="compact-dl">
        <dt>Claim mode</dt><dd>{{ verificationModeText[entry.report.mode] }}</dd>
        <dt>Reported result</dt><dd>{{ verificationStatusText[entry.report.status] }}</dd>
      </dl>
      <p v-if="entry.report.mode === 'mathematical'" class="verification-note">
        This report records the mathematical target's grounding obligations. Its inference requires a separate proof result. Applying it to an external system requires separate evidence.
      </p>
      <p v-else class="verification-note">
        The result is bounded by the declared source bindings, predicates and applicability conditions.
      </p>
      <ol class="verification-obligations">
        <li v-for="(obligation, obligationIndex) in entry.report.obligations" :key="obligationIndex">
          <div class="verification-obligation-title">
            <strong>{{ obligation.id }}</strong>
            <span :data-verification-status="obligation.status">{{ verificationStatusText[obligation.status] }}</span>
          </div>
          <p>{{ obligation.role }}</p>
          <ul v-if="obligation.reasons.length">
            <li v-for="(reason, reasonIndex) in obligation.reasons" :key="reasonIndex">{{ reason }}</li>
          </ul>
          <details>
            <summary>Check, source binding and result</summary>
            <VerificationValues :details="obligation.details" />
          </details>
        </li>
      </ol>
      <section v-if="entry.report.atoms.length" aria-label="Source to symbol bindings">
        <h4>Source to symbol bindings</h4>
        <details v-for="(atom, atomIndex) in entry.report.atoms" :key="atomIndex">
          <summary>{{ atom.symbol }} ← {{ atom.observation_id ?? 'No source binding' }} · {{ verificationStatusText[atom.status] }} · value {{ atom.truth === null ? 'unknown' : String(atom.truth) }}</summary>
          <ul v-if="atom.reasons.length"><li v-for="(reason, reasonIndex) in atom.reasons" :key="reasonIndex">{{ reason }}</li></ul>
          <VerificationValues :details="atom.details" />
        </details>
      </section>
      <section v-if="entry.report.formulas.length" aria-label="Formula evaluations">
        <h4>Formula evaluations</h4>
        <details v-for="(formula, formulaIndex) in entry.report.formulas" :key="formulaIndex">
          <summary>{{ formula.id }} · {{ verificationStatusText[formula.status] }} · value {{ formula.truth === null ? 'unknown' : String(formula.truth) }}</summary>
          <ul v-if="formula.reasons.length"><li v-for="(reason, reasonIndex) in formula.reasons" :key="reasonIndex">{{ reason }}</li></ul>
          <VerificationValues :details="formula.details" />
        </details>
      </section>
      </template>
    </details>
  </section>
</template>
