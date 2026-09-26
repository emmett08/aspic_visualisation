<script setup lang="ts">
import { computed, ref } from "vue";
import ArgumentGraph from "./components/ArgumentGraph.vue";
import {
  buildGraph,
  compareSnapshots,
  parseAspicView,
  MAX_FILE_BYTES,
} from "./domain/aspic";
import type { AspicView } from "./domain/aspic";
import sampleData from "./domain/sample.json";
import { sampleView } from "./domain/sample";

interface SnapshotEvent {
  id: number;
  title: string;
  time: string;
  view: AspicView;
  kind: "sample" | "import";
}
const sample = sampleView;
const events = ref<SnapshotEvent[]>([
  {
    id: 1,
    title: "Engineering example",
    time: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    view: sample,
    kind: "sample",
  },
]);
const activeEvent = ref(1);
const currentIndex = computed(() =>
  events.value.findIndex((e) => e.id === activeEvent.value),
);
const current = computed(() => events.value[currentIndex.value]!);
const view = computed(() => current.value.view);
const graph = ref<InstanceType<typeof ArgumentGraph>>();
const fileInput = ref<HTMLInputElement>();
const query = ref("");
const tab = ref<"arguments" | "relations">("arguments");
const selectedArgument = ref<string | null>(
  sample.arguments.find((a) => a.conclusion === sample.goal)?.id ??
    sample.arguments[0]?.id ??
    null,
);
const selectedEdge = ref<string | null>(null);
const showSupport = ref(true);
const showDefeat = ref(true);
const focus = ref(false);
const visibleCount = ref(sample.arguments.length);
const importError = ref("");
const importing = ref(false);
const announcement = ref("Engineering example loaded.");
const sourcePanel = ref(false);
const graphData = computed(() => buildGraph(view.value));
const argument = computed(() =>
  view.value.arguments.find((a) => a.id === selectedArgument.value),
);
const edge = computed(
  () =>
    graphData.value.edges.find((e) => e.data.id === selectedEdge.value)?.data,
);
const defeat = computed(() =>
  edge.value?.defeatIndex !== undefined
    ? view.value.defeats[edge.value.defeatIndex]
    : undefined,
);
const counts = computed(() => ({
  in: view.value.arguments.filter((a) => a.label === "in").length,
  out: view.value.arguments.filter((a) => a.label === "out").length,
  undecided: view.value.arguments.filter((a) => a.label === "undecided").length,
}));
const filteredArguments = computed(() =>
  view.value.arguments.filter((a) =>
    `${a.id} ${a.display_conclusion} ${a.authored_statement ?? ""} ${a.origin.name} ${a.label}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const filteredRelations = computed(() =>
  graphData.value.edges.filter((e) =>
    `${e.data.kind} ${shortId(e.data.source)} ${shortId(e.data.target)} ${e.data.subargument ?? ""}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const adjacentRelations = computed(() =>
  graphData.value.edges.filter(
    (e) =>
      e.data.source === `argument:${selectedArgument.value}` ||
      e.data.target === `argument:${selectedArgument.value}`,
  ),
);
const changes = computed(() =>
  currentIndex.value > 0
    ? compareSnapshots(events.value[currentIndex.value - 1]!.view, view.value)
    : null,
);
const sourceSummary = computed(() => [
  ["Profile", view.value.profile],
  ["Goal atom", view.value.goal],
  ["Authored EAL status", view.value.authored_claim_status ?? "Not supplied"],
  ["Formal status", view.value.formal_status],
  ["Evaluation time", view.value.evaluated_at ?? "Not supplied"],
  ["Source digest", view.value.source_digest ?? "Not supplied"],
  ["Theory digest", view.value.theory_digest],
  ["Snapshot digest", view.value.snapshot_digest ?? "Not supplied"],
]);
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
  const a = view.value.arguments.find((a) => a.id === shortId(id));
  return a ? `${a.id} · ${a.display_conclusion}` : shortId(id);
}
function previousNodeName(id: string) {
  const previous = events.value[currentIndex.value - 1]?.view.arguments.find(
    (a) => a.id === id,
  );
  return previous ? `${previous.id} · ${previous.display_conclusion}` : id;
}
function selectArgument(id: string) {
  selectedArgument.value = id;
  selectedEdge.value = null;
  announcement.value = `Selected ${nodeName(id)}.`;
}
function selectEdge(id: string) {
  selectedEdge.value = id;
  selectedArgument.value = null;
  focus.value = false;
  announcement.value =
    "Selected relation. Its exact target is shown in the details panel.";
}
function restoreEvent(id: number) {
  activeEvent.value = id;
  query.value = "";
  selectedEdge.value = null;
  focus.value = false;
  selectedArgument.value =
    view.value.arguments.find((a) => a.conclusion === view.value.goal)?.id ??
    view.value.arguments[0]?.id ??
    null;
  announcement.value = `${current.value.title} restored.`;
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importError.value = "";
  importing.value = true;
  try {
    if (file.size > MAX_FILE_BYTES)
      throw new Error("The file exceeds the 4 MiB import limit.");
    const imported = parseAspicView(await file.text());
    const nextId = (events.value.at(-1)?.id ?? 0) + 1;
    events.value.push({
      id: nextId,
      title: file.name,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      view: imported,
      kind: "import",
    });
    if (events.value.length > 20) events.value.shift();
    restoreEvent(nextId);
    announcement.value = `${file.name} imported locally. ${imported.arguments.length} arguments.`;
  } catch (error) {
    importError.value =
      error instanceof Error ? error.message : "The JSON could not be read.";
  } finally {
    importing.value = false;
    input.value = "";
  }
}
function downloadSample() {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(sampleData, null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "engineering-example.aspic-view.json";
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#argument-list">Skip to argument list</a>
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 28 28" fill="none">
            <path
              d="M6 6 21 10 10 22 6 6Z"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <circle cx="6" cy="6" r="3" fill="currentColor" />
            <circle cx="21" cy="10" r="3" fill="currentColor" />
            <circle cx="10" cy="22" r="3" fill="currentColor" />
          </svg>
        </div>
        <div>
          <h1>
            ASPIC<span class="plus">+</span>
            <span class="brand-divider">/</span>
            <span class="brand-subtitle">Argument Explorer</span>
          </h1>
          <p>Inspect the reasoning. Follow the challenge.</p>
        </div>
      </div>
      <div class="header-actions">
        <span class="local-label"
          ><span aria-hidden="true">◌</span> Local session</span
        >
        <button class="button secondary" @click="downloadSample">
          Example JSON
        </button>
        <button
          class="button primary"
          :disabled="importing"
          @click="fileInput?.click()"
        >
          <span aria-hidden="true">+</span>
          {{ importing ? "Reading…" : "Import snapshot" }}
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Import an ASPIC view JSON snapshot"
          @change="importFile"
        />
      </div>
    </header>

    <main>
      <div v-if="importError" class="error-banner" role="alert">
        <strong>Snapshot not imported.</strong> {{ importError }}
        <button aria-label="Dismiss import error" @click="importError = ''">
          ×
        </button>
      </div>
      <section class="summary-bar" aria-label="Current snapshot summary">
        <div class="goal-summary">
          <span class="eyebrow">Current goal</span>
          <h2>{{ view.goal_claim || view.goal }}</h2>
          <span class="goal-result" :class="view.formal_status">{{
            view.formal_status
          }}</span>
        </div>
        <div class="stats" aria-label="Argument labels">
          <span
            ><b>{{ view.arguments.length }}</b> arguments</span
          ><span class="stat-label in"
            ><i aria-hidden="true"></i><b>{{ counts.in }}</b> in</span
          ><span class="stat-label out"
            ><i aria-hidden="true"></i><b>{{ counts.out }}</b> out</span
          ><span class="stat-label undecided"
            ><i aria-hidden="true"></i
            ><b>{{ counts.undecided }}</b> undecided</span
          >
        </div>
        <button
          class="text-button source-button"
          :aria-expanded="sourcePanel"
          @click="sourcePanel = !sourcePanel"
        >
          Snapshot details
          <span aria-hidden="true">{{ sourcePanel ? "−" : "+" }}</span>
        </button>
      </section>
      <section
        v-if="sourcePanel"
        class="source-summary"
        aria-label="Snapshot metadata"
      >
        <dl>
          <template v-for="[label, value] in sourceSummary" :key="label"
            ><dt>{{ label }}</dt>
            <dd>{{ value }}</dd></template
          >
        </dl>
        <p>
          Labels are imported results. Provenance and review references are
          supplied metadata; this viewer does not authenticate them or run the
          solver.
        </p>
      </section>

      <div class="workspace">
        <aside class="index-panel" aria-label="Graph navigation">
          <div class="panel-heading">
            <h2>Explore</h2>
            <span class="small-count">{{ view.arguments.length }}</span>
          </div>
          <label class="search-field"
            ><svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" />
              <path d="m12 12 5 5" /></svg
            ><input
              v-model="query"
              type="search"
              placeholder="Find an argument or relation"
              aria-label="Search arguments and relations"
          /></label>
          <div class="tabs" role="group" aria-label="Navigation list">
            <button
              :class="{ active: tab === 'arguments' }"
              :aria-pressed="tab === 'arguments'"
              @click="tab = 'arguments'"
            >
              Arguments</button
            ><button
              :class="{ active: tab === 'relations' }"
              :aria-pressed="tab === 'relations'"
              @click="tab = 'relations'"
            >
              Relations <span>{{ graphData.edges.length }}</span>
            </button>
          </div>
          <div id="argument-list" class="navigation-list" tabindex="-1">
            <template v-if="tab === 'arguments'">
              <button
                v-for="item in filteredArguments"
                :key="item.id"
                class="argument-row"
                :class="{ selected: selectedArgument === item.id }"
                :aria-pressed="selectedArgument === item.id"
                @click="selectArgument(item.id)"
              >
                <span class="argument-line"
                  ><span class="argument-id">{{ item.id }}</span
                  ><span class="label-chip" :class="item.label">{{
                    item.label
                  }}</span></span
                ><span class="argument-name">{{ item.display_conclusion }}</span
                ><span class="argument-kind"
                  >{{ item.origin.kind
                  }}<span v-if="item.conclusion === view.goal" class="goal-tag"
                    >goal</span
                  ></span
                >
              </button>
              <p v-if="!filteredArguments.length" class="empty-message">
                No matching arguments.
              </p>
            </template>
            <template v-else>
              <button
                v-for="item in filteredRelations"
                :key="item.data.id"
                class="relation-row"
                :class="{ selected: selectedEdge === item.data.id }"
                :aria-pressed="selectedEdge === item.data.id"
                @click="selectEdge(item.data.id)"
              >
                <span class="relation-kind" :class="item.data.kind">{{
                  item.data.kind
                }}</span
                ><strong
                  >{{ shortId(item.data.source) }}
                  <span aria-hidden="true">→</span
                  ><span class="visually-hidden"> to </span>
                  {{ shortId(item.data.target) }}</strong
                ><span v-if="item.data.subargument" class="argument-kind"
                  >at subargument {{ item.data.subargument }}</span
                >
              </button>
              <p v-if="!filteredRelations.length" class="empty-message">
                No matching relations.
              </p>
            </template>
          </div>
          <div class="index-footer">
            <span aria-hidden="true">↳</span> Select a node or relation to
            inspect it.
          </div>
        </aside>

        <section class="graph-panel" aria-label="Argument graph">
          <div class="graph-toolbar">
            <div>
              <h2>Argument graph</h2>
              <p>Direct derivations and formal defeats</p>
            </div>
            <button
              class="icon-button"
              title="Download visible graph as PNG"
              aria-label="Download visible graph as PNG"
              @click="graph?.exportPng()"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 3v10m-4-4 4 4 4-4M3 13v4h14v-4" />
              </svg>
            </button>
          </div>
          <div class="graph-controls">
            <label
              ><input v-model="showSupport" type="checkbox" /><span
                class="line-key support"
                aria-hidden="true"
              ></span
              >Derivations</label
            ><label
              ><input v-model="showDefeat" type="checkbox" /><span
                class="line-key defeat"
                aria-hidden="true"
              ></span
              >Defeats</label
            ><label class="focus-control"
              ><input
                v-model="focus"
                type="checkbox"
                :disabled="!selectedArgument"
              />Neighbourhood</label
            >
          </div>
          <div class="graph-stage">
            <ArgumentGraph
              ref="graph"
              :view="view"
              :selected-argument="selectedArgument"
              :selected-edge="selectedEdge"
              :show-support="showSupport"
              :show-defeat="showDefeat"
              :focus="focus"
              @select-argument="selectArgument"
              @select-edge="selectEdge"
              @visible-count="visibleCount = $event"
            />
            <div
              v-if="focus || !showSupport || !showDefeat"
              class="filter-note"
              role="status"
            >
              Filtered view · {{ visibleCount }} /
              {{ view.arguments.length }} arguments<span v-if="!showSupport">
                · derivations hidden</span
              ><span v-if="!showDefeat"> · defeats hidden</span>
            </div>
            <div class="graph-zoom">
              <button
                aria-label="Zoom in"
                title="Zoom in"
                @click="graph?.zoom(1.25)"
              >
                +</button
              ><button
                aria-label="Zoom out"
                title="Zoom out"
                @click="graph?.zoom(0.8)"
              >
                −</button
              ><button
                aria-label="Fit graph"
                title="Fit graph"
                @click="graph?.fit()"
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 3H3v4m10-4h4v4M3 13v4h4m6 0h4v-4" />
                </svg>
              </button>
            </div>
            <div class="canvas-hint">Drag to explore · scroll to zoom</div>
            <div v-if="!view.arguments.length" class="graph-empty">
              No constructible arguments in this snapshot.
            </div>
          </div>
          <div class="graph-legend">
            <span><i class="legend-node in" aria-hidden="true"></i>In</span
            ><span><i class="legend-node out" aria-hidden="true"></i>Out</span
            ><span
              ><i class="legend-node undecided" aria-hidden="true"></i
              >Undecided</span
            ><span><i class="legend-node goal" aria-hidden="true"></i>Goal</span
            ><span class="legend-note"
              >Labels are relative to the imported theory.</span
            >
          </div>
        </section>

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
              <section
                v-if="field(argument.origin, 'span')"
                class="detail-section"
              >
                <h4>Source location</h4>
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
              <span class="relation-kind" :class="edge.kind">{{
                edge.kind
              }}</span>
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
                  {{
                    edge.kind === "support" ? "Direct subargument" : "Attacker"
                  }}
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
                    edge.kind === "support"
                      ? "Derived argument"
                      : "Defeated argument"
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
                <p v-else>
                  The attack challenges this subargument’s conclusion.
                </p>
              </section>
              <section
                v-if="defeat && field(defeat, 'relation_origin')"
                class="detail-section"
              >
                <h4>Authored relation</h4>
                <pre>{{ pretty(field(defeat, "relation_origin")) }}</pre>
              </section>
              <p v-if="defeat" class="small-note">
                Several defeat edges may share endpoints while identifying
                different attacked subarguments.
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
                These declarations did not supply a premise. Absence is not
                falsity.
              </p>
              <details
                v-for="(item, index) in view.unavailable_evidence"
                :key="index"
              >
                <summary>
                  {{ textField(item, "name") || `Evidence ${index + 1}` }}
                </summary>
                <pre>{{ pretty(item) }}</pre>
              </details>
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
      </div>

      <section class="events-panel" aria-label="Snapshot events">
        <div class="events-heading">
          <div>
            <h2>
              Snapshot events <span>{{ events.length }}</span>
            </h2>
            <p>Session imports · select an event to restore its graph</p>
          </div>
          <span class="session-note">In memory only · last 20 snapshots</span>
        </div>
        <div class="event-track">
          <button
            v-for="(event, index) in events"
            :key="event.id"
            class="event-card"
            :class="{ active: event.id === activeEvent }"
            :aria-pressed="event.id === activeEvent"
            @click="restoreEvent(event.id)"
          >
            <span class="event-marker" aria-hidden="true">{{ index + 1 }}</span
            ><span class="event-copy"
              ><strong>{{ event.title }}</strong
              ><span
                >{{
                  event.kind === "sample"
                    ? "Sample loaded"
                    : "Snapshot imported"
                }}
                · {{ event.time }}</span
              ></span
            ><span v-if="event.id === activeEvent" class="active-event-label"
              >Viewing</span
            >
          </button>
        </div>
        <div class="event-diff">
          <template v-if="changes"
            ><strong>Argument structure and labels:</strong
            ><span class="diff-added"
              >+{{ changes.added.length }} arguments</span
            ><span class="diff-removed"
              >−{{ changes.removed.length }} arguments</span
            ><span>{{ changes.labelChanged.length }} label changes</span
            ><span v-if="changes.warnings.length" class="diff-warning">{{
              changes.warnings.join(" ")
            }}</span></template
          ><template v-else
            ><span class="event-dot" aria-hidden="true"></span>Initial snapshot.
            Import another export to compare argument identities and
            labels.</template
          >
        </div>
        <details
          v-if="
            changes &&
            (changes.added.length ||
              changes.removed.length ||
              changes.labelChanged.length)
          "
          class="change-list"
        >
          <summary>Inspect argument structure and label changes</summary>
          <ul>
            <li v-for="id in changes.added" :key="'added:' + id">
              <span class="change-kind diff-added">Added</span
              ><button class="text-button" @click="selectArgument(id)">
                {{ nodeName(id) }} ↗
              </button>
            </li>
            <li
              v-for="item in changes.labelChanged"
              :key="'changed:' + item.currentId"
            >
              <span class="change-kind">Label changed</span
              ><button
                class="text-button"
                @click="selectArgument(item.currentId)"
              >
                {{ nodeName(item.currentId) }} ↗</button
              ><span
                ><span class="label-chip" :class="item.previousLabel">{{
                  item.previousLabel
                }}</span>
                →
                <span class="label-chip" :class="item.currentLabel">{{
                  item.currentLabel
                }}</span></span
              >
            </li>
            <li v-for="id in changes.removed" :key="'removed:' + id">
              <span class="change-kind diff-removed">Removed</span
              ><span>{{ previousNodeName(id) }}</span
              ><span class="small-note">previous snapshot</span>
            </li>
          </ul>
        </details>
      </section>
      <footer class="app-footer">
        <span
          >ASPIC+ VIEW / 1 <span aria-hidden="true">·</span> All files stay in
          this browser.</span
        ><span
          >Snapshot events record imports, not the order in which reasoning
          occurred.</span
        >
      </footer>
    </main>
    <p class="visually-hidden" role="status" aria-live="polite">
      {{ announcement }}
    </p>
  </div>
</template>
