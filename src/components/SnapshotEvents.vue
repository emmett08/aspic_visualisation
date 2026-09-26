<script lang="ts">
import type { AspicView } from "../domain/aspic";

export interface SnapshotEvent {
  id: number;
  title: string;
  time: string;
  view: AspicView;
  kind: "sample" | "import";
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { compareSnapshots } from "../domain/aspic";

const props = defineProps<{
  events: readonly SnapshotEvent[];
  activeEvent: number;
}>();
const emit = defineEmits<{
  restore: [id: number];
  selectArgument: [id: string];
}>();
const currentIndex = computed(() =>
  props.events.findIndex((event) => event.id === props.activeEvent),
);
const view = computed(() => props.events[currentIndex.value]!.view);
const changes = computed(() =>
  currentIndex.value > 0
    ? compareSnapshots(props.events[currentIndex.value - 1]!.view, view.value)
    : null,
);
function nodeName(id: string) {
  const a = view.value.arguments.find((a) => a.id === id);
  return a ? `${a.id} · ${a.display_conclusion}` : id;
}
function previousNodeName(id: string) {
  const previous = props.events[currentIndex.value - 1]?.view.arguments.find(
    (a) => a.id === id,
  );
  return previous ? `${previous.id} · ${previous.display_conclusion}` : id;
}

function restoreEvent(id: number) {
  emit("restore", id);
}
function selectArgument(id: string) {
  emit("selectArgument", id);
}
</script>

<template>
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
              event.kind === "sample" ? "Sample loaded" : "Snapshot imported"
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
        ><span class="diff-added">+{{ changes.added.length }} arguments</span
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
          ><button class="text-button" @click="selectArgument(item.currentId)">
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
</template>
