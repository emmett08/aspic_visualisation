<script setup lang="ts">
import { computed } from "vue";
import type { AspicView, AspicGraph } from "../domain/aspic";
import { availabilityIssueText, availabilityIssueTitle, evidenceGroups } from "../domain/aspic";

const props = defineProps<{
  view: AspicView;
  graphData: AspicGraph;
  selectedArgument: string | null;
  selectedEdge: string | null;
}>();
const emit = defineEmits<{
  selectArgument: [id: string];
  selectEdge: [id: string];
}>();
const groups = computed(() => evidenceGroups(props.view));
const argument = computed(() =>
  props.view.arguments.find((a) => a.id === props.selectedArgument),
);
const edge = computed(
  () =>
    props.graphData.edges.find((e) => e.data.id === props.selectedEdge)?.data,
);
const defeat = computed(() =>
  edge.value?.defeatIndex !== undefined
    ? props.view.defeats[edge.value.defeatIndex]
    : undefined,
);
const adjacentRelations = computed(() =>
  props.graphData.edges.filter(
    (e) =>
      e.data.source === `argument:${props.selectedArgument}` ||
      e.data.target === `argument:${props.selectedArgument}`,
  ),
);
function shortId(id: string) {
  return id.replace(/^argument:/, "");
}
function pretty(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function field(value: unknown, name: string): unknown {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)[name]
    : undefined;
}
function textField(value: unknown, name: string): string {
  const result = field(value, name);
  return result === undefined || result === null ? "" : pretty(result);
}
function nodeName(id: string) {
  const a = props.view.arguments.find((a) => a.id === shortId(id));
  return a ? `${a.id} · ${a.display_conclusion}` : shortId(id);
}

function selectArgument(id: string) {
  emit("selectArgument", id);
}
function selectEdge(id: string) {
  emit("selectEdge", id);
}
</script>

<template>
  <aside class="details-panel" aria-label="Selection details">
    <div class="panel-heading">
      <h2>Inspect</h2>
      <span class="eyebrow">{{ edge ? "Relation" : "Argument" }}</span>
    </div>
    <div class="details-content">
      <template v-if="argument">
        <div class="detail-id">
          <span>{{ argument.id }}</span
          ><span class="label-chip" :class="argument.label">{{
            argument.label
          }}</span>
        </div>
        <h3>{{ argument.display_conclusion }}</h3>
        <p v-if="argument.authored_statement" class="statement">
          {{ argument.authored_statement }}
        </p>
        <p v-else class="statement muted">
          {{
            textField(argument.origin, "meaning") ||
            "No authored claim statement supplied."
          }}
        </p>
        <dl class="compact-dl">
          <dt>Source kind</dt>
          <dd>{{ argument.origin.kind }}</dd>
          <dt>Source name</dt>
          <dd>{{ argument.origin.name }}</dd>
          <dt>Rule / premise</dt>
          <dd>{{ argument.rule_id || argument.conclusion }}</dd>
          <dt>Inference</dt>
          <dd>{{ argument.top }}</dd>
          <dt
            title="Minimum rank across the fallible elements in this derivation"
          >
            Strength
          </dt>
          <dd>
            {{
              argument.strength === 1001
                ? "Strict / axiom only"
                : argument.strength
            }}
          </dd>
          <template v-if="argument.rank !== undefined"
            ><dt>Authored rank</dt>
            <dd>{{ argument.rank }}</dd></template
          >
        </dl>
        <section
          v-if="argument.direct_subarguments.length"
          class="detail-section"
        >
          <h4>Direct subarguments</h4>
          <div class="inline-buttons">
            <button
              v-for="id in argument.direct_subarguments"
              :key="id"
              @click="selectArgument(id)"
            >
              {{ id }} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
        <section
          v-if="
            textField(argument.origin, 'rationale') ||
            textField(argument.origin, 'reasoning')
          "
          class="detail-section"
        >
          <h4>Authored reasoning</h4>
          <p class="metadata-text">
            {{
              textField(argument.origin, "rationale") ||
              textField(argument.origin, "reasoning")
            }}
          </p>
        </section>
        <section v-if="argument.origin.scope_transfer" class="detail-section">
          <h4>Conditional scope transfer</h4>
          <pre>{{ pretty(argument.origin.scope_transfer) }}</pre>
          <p class="small-note">Proposition correspondence is checked by EAL. The transfer justification is an authored assumption.</p>
        </section>
        <section v-if="field(argument.origin, 'span')" class="detail-section">
          <h4>Source location</h4>
          <p v-if="argument.origin.source_file">{{ argument.origin.source_file }}</p>
          <pre>{{ pretty(field(argument.origin, "span")) }}</pre>
        </section>
        <section
          v-if="field(argument.origin, 'formal_review')"
          class="detail-section"
        >
          <h4>Reviewed annotations</h4>
          <pre>{{ pretty(field(argument.origin, "formal_review")) }}</pre>
          <p class="small-note">
            Authored references; review is not verified here.
          </p>
        </section>
        <section
          v-if="field(argument.origin, 'observation')"
          class="detail-section"
        >
          <h4>Observation identity</h4>
          <pre>{{ pretty(field(argument.origin, "observation")) }}</pre>
        </section>
        <section class="detail-section">
          <h4>
            Connected relations
            <span>{{ adjacentRelations.length }}</span>
          </h4>
          <button
            v-for="item in adjacentRelations"
            :key="item.data.id"
            class="detail-relation"
            @click="selectEdge(item.data.id)"
          >
            <span class="relation-kind" :class="item.data.kind">{{
              item.data.kind
            }}</span
            ><span
              >{{ shortId(item.data.source) }} →
              {{ shortId(item.data.target) }}</span
            ><span aria-hidden="true">↗</span>
          </button>
          <p v-if="!adjacentRelations.length" class="small-note">
            No connected relations.
          </p>
        </section>
        <details class="raw-details">
          <summary>Supplied argument record</summary>
          <pre>{{ pretty(argument) }}</pre>
        </details>
      </template>
      <template v-else-if="edge">
        <span class="relation-kind" :class="edge.kind">{{ edge.kind }}</span>
        <h3 class="edge-title">
          {{ shortId(edge.source) }} <span aria-hidden="true">→</span>
          {{ shortId(edge.target) }}
        </h3>
        <p class="statement">
          {{
            edge.kind === "support"
              ? "A direct subargument contributes to this derivation."
              : "A formal defeat targets this argument through the stated subargument."
          }}
        </p>
        <section class="detail-section">
          <h4>
            {{ edge.kind === "support" ? "Direct subargument" : "Attacker" }}
          </h4>
          <button
            class="text-button wrap-button"
            @click="selectArgument(shortId(edge.source))"
          >
            {{ nodeName(edge.source) }} ↗
          </button>
        </section>
        <section class="detail-section">
          <h4>
            {{
              edge.kind === "support" ? "Derived argument" : "Defeated argument"
            }}
          </h4>
          <button
            class="text-button wrap-button"
            @click="selectArgument(shortId(edge.target))"
          >
            {{ nodeName(edge.target) }} ↗
          </button>
        </section>
        <section v-if="defeat" class="witness-box">
          <h4>Exact attacked subargument</h4>
          <button
            class="text-button wrap-button"
            @click="selectArgument(defeat.subargument)"
          >
            {{ nodeName(defeat.subargument) }} ↗
          </button>
          <p v-if="defeat.kind === 'undercut'">
            The attack challenges this subargument’s defeasible rule.
          </p>
          <p v-else-if="defeat.kind === 'undermine'">
            The attack challenges this subargument’s ordinary premise.
          </p>
          <p v-else>The attack challenges this subargument’s conclusion.</p>
        </section>
        <section
          v-if="defeat && field(defeat, 'relation_origin')"
          class="detail-section"
        >
          <h4>Authored relation</h4>
          <pre>{{ pretty(field(defeat, "relation_origin")) }}</pre>
        </section>
        <p v-if="defeat" class="small-note">
          Several defeat edges may share endpoints while identifying different
          attacked subarguments.
        </p>
      </template>
      <p v-else class="empty-message">
        Select an argument or relation in the graph or navigation list.
      </p>
      <section
        v-if="view.unavailable_evidence.length"
        class="unavailable-section"
      >
        <h4>
          Unavailable evidence
          <span>{{ view.unavailable_evidence.length }}</span>
        </h4>
        <p>
          These declarations did not supply a premise. Absence is not falsity.
        </p>
        <section v-for="group in groups" :key="group.issue" class="evidence-group" :data-issue="group.issue">
          <h5>{{ availabilityIssueTitle[group.issue] }} <span>{{ group.items.length }}</span></h5>
          <p>{{ group.description }}</p>
          <details v-for="item in group.items" :key="item.name">
            <summary>{{ item.name }}</summary>
            <ul class="availability-issues" aria-label="Evidence availability causes">
              <li v-for="issue in item.availability_issues" :key="issue">{{ availabilityIssueText[issue] }}</li>
            </ul>
            <pre>{{ pretty(item) }}</pre>
          </details>
        </section>
      </section>
    </div>
    <div class="provenance-note">
      <svg class="info-icon" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 7v4m0-6v.5" />
      </svg>
      Source provenance is supplied, not authenticated.
    </div>
  </aside>
</template>
