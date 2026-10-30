<script setup lang="ts">
import { computed, ref } from "vue";
import ArgumentGraph from "./components/ArgumentGraph.vue";
import ArgumentInspector from "./components/ArgumentInspector.vue";
import SnapshotEvents from "./components/SnapshotEvents.vue";
import TheoryEditor from "./components/TheoryEditor.vue";
import VerificationReports from "./components/VerificationReports.vue";
import type { SnapshotEvent } from "./components/SnapshotEvents.vue";
import type { AspicView } from "./domain/aspic";
import { buildGraph, parseAspicView, MAX_FILE_BYTES } from "./domain/aspic";
import sampleData from "./domain/sample.json";
import { sampleView } from "./domain/sample";

const sample = sampleView;
const solverEnabled = import.meta.env.DEV && __ASPIC_SOLVER_ENABLED__;
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
const selectedExtension = ref<number | null>(null);
const displayView = computed(() => {
  if (selectedExtension.value === null) return view.value;
  const extension = new Set(view.value.extensions[selectedExtension.value] ?? []);
  const attacked = new Set(view.value.defeats.filter(d => extension.has(d.attacker)).map(d => d.target));
  return {...view.value, arguments: view.value.arguments.map(a => ({...a, label: extension.has(a.id) ? 'in' as const : attacked.has(a.id) ? 'out' as const : 'undecided' as const}))};
});
const graphData = computed(() => buildGraph(displayView.value));
const counts = computed(() => ({
  in: displayView.value.arguments.filter((a) => a.label === "in").length,
  out: displayView.value.arguments.filter((a) => a.label === "out").length,
  undecided: displayView.value.arguments.filter((a) => a.label === "undecided").length,
}));
const filteredArguments = computed(() =>
  displayView.value.arguments.filter((a) =>
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
const sourceSummary = computed(() => [
  ["Profile", view.value.profile],
  ["Goal atom", view.value.goal],
  ["Authored EAL status", view.value.authored_claim_status ?? "Not supplied"],
  ["Grounded graph status", view.value.formal_status],
  ["Selected query", `${view.value.semantics} / ${view.value.query_mode}: ${view.value.query_status}`],
  ["Preference", view.value.preference],
  ["Extensions", String(view.value.extensions.length)],
  ["Evaluation time", view.value.evaluated_at ?? "Not supplied"],
  ["Source digest", view.value.source_digest ?? "Not supplied"],
  ["Theory digest", view.value.theory_digest],
  ["Snapshot digest", view.value.snapshot_digest ?? "Not supplied"],
]);
function shortId(id: string) {
  return id.replace(/^argument:/, "");
}
function nodeName(id: string) {
  const a = view.value.arguments.find((a) => a.id === shortId(id));
  return a ? `${a.id} · ${a.display_conclusion}` : shortId(id);
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
  selectedExtension.value = null;
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
function addSolvedTheory({ view: solved, title }: { view: AspicView; title: string }) {
  const nextId = (events.value.at(-1)?.id ?? 0) + 1;
  events.value.push({ id: nextId, title, time: new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  }), view: solved, kind: "evaluation" });
  if (events.value.length > 20) events.value.shift();
  restoreEvent(nextId);
  announcement.value = `${title} evaluated. ${solved.arguments.length} arguments.`;
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
      <TheoryEditor :enabled="solverEnabled" @solved="addSolvedTheory" />
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
          <span class="goal-result" :class="view.query_status">{{
            view.query_status
          }}</span>
        </div>
        <label class="extension-label">Graph labels
          <select v-model="selectedExtension" aria-label="Graph labelling"><option :value="null">Grounded</option><option v-for="(extension,index) in view.extensions" :key="index" :value="index">{{ view.semantics }} extension {{ index + 1 }} · {{ extension.length }} in</option></select>
        </label>
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
        <details v-if="view.formal_directives.length" class="reviewed-directives">
          <summary>Reviewed directives · {{ view.formal_directives.length }}</summary>
          <ul>
            <li v-for="(directive,index) in view.formal_directives" :key="index">
              <code>{{ directive.kind }} {{ directive.name }}{{ directive.other ? ` → ${directive.other}` : '' }}{{ directive.rank !== null ? ` ${directive.rank}` : '' }}</code>
              <span> · {{ directive.review }}</span>
              <span v-if="directive.source_file"> · {{ directive.source_file }}</span>
            </li>
          </ul>
        </details>
        <p>
          Provenance and review references are supplied metadata; this viewer
          does not authenticate them. The optional theory editor delegates
          evaluation to EAL; imported files are checked locally in the browser.
        </p>
      </section>

      <VerificationReports :reports="view.verification_reports ?? []" />

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
              :view="displayView"
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
              >Labels are relative to the assessed theory.</span
            >
          </div>
        </section>

        <ArgumentInspector
          :view="displayView"
          :graph-data="graphData"
          :selected-argument="selectedArgument"
          :selected-edge="selectedEdge"
          @select-argument="selectArgument"
          @select-edge="selectEdge"
        />
      </div>

      <SnapshotEvents
        :events="events"
        :active-event="activeEvent"
        @restore="restoreEvent"
        @select-argument="selectArgument"
      />
      <footer class="app-footer">
        <span
          >ASPIC+ VIEW / 3 <span aria-hidden="true">·</span> Imported files stay in
          this browser. <template v-if="solverEnabled">Edited theories use the local EAL solver.</template></span
        ><span
          >Snapshot events record imports and evaluations, not the order in which reasoning
          occurred.</span
        >
      </footer>
    </main>
    <p class="visually-hidden" role="status" aria-live="polite">
      {{ announcement }}
    </p>
  </div>
</template>
