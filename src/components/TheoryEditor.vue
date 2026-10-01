<script setup lang="ts">
import { reactive, ref } from 'vue'
import { parseAspicView, type AspicView } from '../domain/aspic'
import { emptyTheoryFields, engineeringDemo, parseTheoryFields } from '../domain/theory'

const props = withDefaults(defineProps<{ enabled?: boolean }>(), { enabled: false })
const emit = defineEmits<{ solved: [result: { view: AspicView; title: string }] }>()
const fields = reactive(emptyTheoryFields())
const submitting = ref(false)
const error = ref('')
const status = ref('')

function loadDemo() {
  Object.assign(fields, engineeringDemo)
  error.value = ''
  status.value = 'Pump-readiness demo entered. Build its graph to inspect the challenged test and independent inspection.'
}

async function build() {
  if (submitting.value || !props.enabled) return
  error.value = ''; status.value = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const theory = parseTheoryFields(fields)
    submitting.value = true
    const controller = new AbortController()
    timer = setTimeout(() => controller.abort(), 20_000)
    const response = await fetch('/api/solve', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theory }), signal: controller.signal,
    })
    const text = await response.text()
    if (!response.ok) {
      let message = `The theory service returned HTTP ${response.status}.`
      try {
        const body: unknown = JSON.parse(text)
        if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') message = body.error
      } catch { /* Keep the safe HTTP description for non-JSON responses. */ }
      throw new Error(message)
    }
    const view = parseAspicView(text)
    emit('solved', { view, title: `Theory: ${theory.goal}` })
    status.value = `Graph built: ${view.arguments.length} arguments; goal ${view.query_status}.`
  } catch (cause) {
    error.value = cause instanceof Error && cause.name === 'AbortError'
      ? 'The theory service did not respond within 20 seconds. Try a smaller theory.'
      : cause instanceof Error ? cause.message : 'The graph could not be built.'
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    submitting.value = false
  }
}
</script>

<template>
  <details class="theory-editor" open>
    <summary><span>Build an ASPIC+ argument graph</span><span class="theory-subtitle">Explicit premises, rules and objections</span></summary>
    <form class="theory-form" :aria-busy="submitting" @submit.prevent="build">
      <div class="theory-intro">
        <p>One entry per line. This uses EAL’s bounded ASPIC+ profile: finite premise-founded derivations and explicit acceptance semantics. <span v-if="enabled">Your theory is sent to this site’s solver when you build.</span><span v-else>Start the optional EAL solver to build edited theories.</span></p>
        <button type="button" class="theory-demo" :disabled="submitting" @click="loadDemo">Load engineering demo</button>
      </div>
      <div class="theory-fields">
        <label class="theory-field" for="theory-axioms">
          <span>Axioms</span>
          <textarea id="theory-axioms" v-model="fields.axioms" aria-label="Axioms" aria-describedby="axioms-hint" spellcheck="false" placeholder="voltage_ok" :disabled="submitting" />
          <small id="axioms-hint">Indefeasible premises; one atom per line.</small>
        </label>
        <label class="theory-field" for="theory-premises">
          <span>Ordinary premises</span>
          <textarea id="theory-premises" v-model="fields.premises" aria-label="Ordinary premises" aria-describedby="premises-hint" spellcheck="false" placeholder="test_pass&#10;inspection_ok @ 700" :disabled="submitting" />
          <small id="premises-hint">Fallible premises: atom, optionally @ rank.</small>
        </label>
        <label class="theory-field" for="theory-contraries">
          <span>Contraries</span>
          <textarea id="theory-contraries" v-model="fields.contraries" aria-label="Contraries" aria-describedby="contraries-hint" spellcheck="false" placeholder="unreliable_test -> applicable_d1" :disabled="submitting" />
          <small id="contraries-hint">attacker → target. No implicit negation or reverse relation.</small>
        </label>
        <label class="theory-field" for="theory-strict">
          <span>Strict rules</span>
          <textarea id="theory-strict" v-model="fields.strictRules" aria-label="Strict rules" aria-describedby="strict-hint" spellcheck="false" placeholder="s1: voltage_ok -> power_ok" :disabled="submitting" />
          <small id="strict-hint">id: p, q → r. Assert only checked deductive relationships.</small>
        </label>
        <label class="theory-field theory-defeasible" for="theory-defeasible">
          <span>Defeasible rules</span>
          <textarea id="theory-defeasible" v-model="fields.defeasibleRules" aria-label="Defeasible rules" aria-describedby="defeasible-hint" spellcheck="false" placeholder="d1: test_pass, power_ok => pump_ready" :disabled="submitting" />
          <small id="defeasible-hint">id [name]: p, q ⇒ r, optionally @ rank. Name defaults to applicable_id; an undercut targets that name.</small>
        </label>
      </div>
      <div class="assessment-fields">
        <label>Acceptance<select v-model="fields.semantics" aria-label="Acceptance semantics"><option value="grounded">Grounded</option><option value="preferred">Preferred extensions</option><option value="stable">Stable extensions</option></select></label>
        <label>Query<select v-model="fields.queryMode" aria-label="Query mode"><option value="sceptical">In every extension</option><option value="credulous">In at least one extension</option></select></label>
        <label>Preference<select v-model="fields.preference" aria-label="Preference ordering"><option value="minimum_rank">Lowest rank in the derivation</option><option value="last_link_rank">Last defeasible rule ranks</option><option value="last_link_partial">Declared last-link priorities</option></select></label>
        <label v-if="fields.preference === 'last_link_partial'" class="priority-field">Priorities<textarea v-model="fields.priorities" aria-label="Priorities" rows="3" spellcheck="false" placeholder="rule d3 > d1&#10;premise inspection_ok > test_pass" :disabled="submitting" /></label>
      </div>
      <div class="theory-footer">
        <label class="theory-goal" for="theory-goal">Goal<input id="theory-goal" v-model="fields.goal" placeholder="pump_ready" spellcheck="false" :disabled="submitting" /></label>
        <p>Ranks 0–1000; default 500. The selected preference controls defeat. Processor budgets bound construction and extension search.</p>
        <button class="theory-build" type="submit" :disabled="submitting || !enabled">{{ submitting ? 'Building graph…' : 'Build graph' }}</button>
      </div>
      <p v-if="error" class="theory-error" role="alert">{{ error }}</p>
      <p v-if="status" class="theory-status" role="status">{{ status }}</p>
    </form>
  </details>
</template>

<style scoped>
.theory-editor { margin: 0 0 18px; border: 1px solid #d7dfda; border-radius: 14px; background: #fff; color: #243d32; }
.theory-editor summary { display: flex; gap: 18px; align-items: baseline; padding: 16px 20px; cursor: pointer; font-weight: 650; }
.theory-editor summary::before { content: '▸'; font-size: 12px; }
.theory-editor[open] summary::before { content: '▾'; }
.theory-subtitle { font-size: 12px; font-weight: 400; color: #627469; }
.theory-form { padding: 0 20px 18px; }
.theory-intro { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.theory-intro p { margin: 0; max-width: 850px; font-size: 12px; line-height: 1.6; color: #54675c; }
.theory-demo, .theory-build { flex-shrink: 0; padding: 9px 13px; border: 1px solid #bdcdc3; border-radius: 7px; background: #f7faf8; color: #284f3b; font: inherit; font-size: 12px; cursor: pointer; }
.theory-build { background: #284f3b; color: #fff; border-color: #284f3b; }
.theory-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 18px; }
.theory-field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; }
.theory-field textarea { box-sizing: border-box; width: 100%; min-height: 90px; resize: vertical; border: 1px solid #cbd7cf; border-radius: 6px; background: #fbfcfb; padding: 10px; color: #233d2f; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; }
.theory-field textarea:focus, .theory-goal input:focus { outline: 2px solid #60846e; outline-offset: 1px; }
.theory-field small { color: #66786c; font-weight: 400; font-size: 11px; line-height: 1.45; }
.theory-defeasible { grid-column: span 2; }
.theory-footer { display: flex; align-items: end; gap: 20px; margin-top: 15px; }
.theory-goal { display: flex; flex-direction: column; gap: 6px; min-width: 215px; font-size: 12px; font-weight: 600; }
.theory-goal input { min-height: 35px; box-sizing: border-box; padding: 7px 10px; border: 1px solid #cbd7cf; border-radius: 6px; font: 12px ui-monospace, monospace; color: #233d2f; }
.theory-footer p { flex: 1; margin: 0; font-size: 11px; line-height: 1.55; color: #66786c; }
.theory-error, .theory-status { margin: 12px 0 0; font-size: 12px; line-height: 1.5; }
.theory-error { color: #a33030; }
.theory-status { color: #2d6846; }
button:disabled { opacity: .6; cursor: not-allowed; }
@media (max-width: 800px) {
  .theory-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .theory-intro, .theory-footer { flex-wrap: wrap; }
  .theory-subtitle { display: none; }
}
@media (max-width: 520px) {
  .theory-fields { grid-template-columns: 1fr; }
  .theory-defeasible { grid-column: auto; }
  .theory-goal { width: 100%; }
  .theory-footer p { flex-basis: 100%; }
}
</style>

<style scoped>
.assessment-fields { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; }
.assessment-fields label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
.assessment-fields select, .assessment-fields textarea { padding: 8px; border: 1px solid #cbd7cf; border-radius: 6px; background: #fbfcfb; }
.assessment-fields .priority-field { flex-basis: 100%; }
.priority-field textarea { box-sizing: border-box; width: 100%; resize: vertical; font: 12px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; }
</style>
