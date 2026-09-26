<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import cytoscape from "cytoscape";
import type {
  Core,
  ElementDefinition,
  EventObject,
  StylesheetJson,
} from "cytoscape";
import { buildGraph, compareSnapshots } from "../domain/aspic";
import type { AspicView } from "../domain/aspic";

const props = defineProps<{
  view: AspicView;
  selectedArgument: string | null;
  selectedEdge: string | null;
  showSupport: boolean;
  showDefeat: boolean;
  focus: boolean;
}>();
const emit = defineEmits<{
  selectArgument: [id: string];
  selectEdge: [id: string];
  visibleCount: [count: number];
}>();
const container = ref<HTMLDivElement>();
let cy: Core | undefined;
let observer: ResizeObserver | undefined;
let previousView: AspicView | undefined;

const styles: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(caption)",
      "background-color": "#f0f8f3",
      "border-color": "#327958",
      "border-width": 2,
      width: 170,
      height: 66,
      shape: "round-rectangle",
      color: "#17382a",
      "font-family": "system-ui, sans-serif",
      "font-size": 12,
      "font-weight": 600,
      "text-wrap": "wrap",
      "text-max-width": "150px",
      "text-valign": "center",
      "text-halign": "center",
      "overlay-padding": 6,
      "transition-property": "border-color, border-width",
      "transition-duration": 120,
    },
  },
  {
    selector: 'node[status="out"]',
    style: {
      "background-color": "#fff0ed",
      "border-color": "#be5944",
      color: "#783b2f",
    },
  },
  {
    selector: 'node[status="undecided"]',
    style: {
      "background-color": "#fff8e6",
      "border-color": "#b58a2e",
      "border-style": "dashed",
      color: "#6e5621",
    },
  },
  { selector: "node[?goal]", style: { "border-width": 4 } },
  {
    selector: "node.chosen",
    style: {
      "border-width": 4,
      "border-color": "#202d3a",
      "overlay-opacity": 0.09,
      "overlay-color": "#23354b",
    },
  },
  {
    selector: "edge",
    style: {
      width: 2,
      "curve-style": "bezier",
      "line-color": "#9aa7b1",
      "target-arrow-color": "#9aa7b1",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.9,
      "font-size": 10,
      "font-family": "system-ui, sans-serif",
      "text-background-opacity": 1,
      "text-background-color": "#f9fbfc",
      "text-background-padding": "3px",
      "text-rotation": "autorotate",
      "text-margin-y": -8,
      "overlay-padding": 8,
    },
  },
  {
    selector: 'edge[kind!="support"]',
    style: {
      "line-color": "#bc5a49",
      "target-arrow-color": "#bc5a49",
      "line-style": "dashed",
      "target-arrow-shape": "tee",
      label: "data(kind)",
      color: "#984638",
      "control-point-step-size": 60,
    },
  },
  {
    selector: 'edge[kind="undermine"]',
    style: {
      "line-color": "#a06c37",
      "target-arrow-color": "#a06c37",
      color: "#855722",
    },
  },
  {
    selector: 'edge[kind="rebut"]',
    style: {
      "line-color": "#946186",
      "target-arrow-color": "#946186",
      color: "#784a6c",
    },
  },
  {
    selector: "edge.chosen",
    style: {
      width: 4,
      "line-color": "#253e62",
      "target-arrow-color": "#253e62",
      color: "#253e62",
    },
  },
  { selector: ".filtered", style: { display: "none" } },
];

function draw() {
  if (!container.value) return;
  const graph = buildGraph(props.view);
  const retainedPositions = new Map<string, { x: number; y: number }>();
  if (cy && previousView) {
    const diff = compareSnapshots(previousView, props.view);
    for (const match of [...diff.unchanged, ...diff.labelChanged]) {
      const oldNode = cy.getElementById(`argument:${match.previousId}`);
      if (oldNode.length)
        retainedPositions.set(match.currentId, { ...oldNode.position() });
    }
  }
  const byId = new Map(props.view.arguments.map((a) => [a.id, a]));
  const depths = new Map<string, number>();
  function depth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    const value = byId.get(id)!;
    const result = value.direct_subarguments.length
      ? 1 + Math.max(...value.direct_subarguments.map(depth))
      : 0;
    depths.set(id, result);
    return result;
  }
  const layers = new Map<number, string[]>();
  props.view.arguments.forEach((a) => {
    const d = depth(a.id);
    layers.set(d, [...(layers.get(d) ?? []), a.id]);
  });
  // Barycentre sweeps group related branches before drawing defeats over them.
  // Only support edges determine layout; cycles in the defeat graph do not.
  const children = new Map<string, string[]>();
  props.view.arguments.forEach((a) =>
    a.direct_subarguments.forEach((parent) => {
      children.set(parent, [...(children.get(parent) ?? []), a.id]);
    }),
  );
  const layerNumbers = [...layers.keys()].sort((a, b) => a - b);
  const semanticName = (id: string): string => {
    const a = byId.get(id)!;
    return `${a.origin.kind}:${a.origin.name}:${a.conclusion}:${a.id}`;
  };
  const horizontalPosition = (id: string): number => {
    const row = layers.get(depth(id))!;
    return row.indexOf(id) - (row.length - 1) / 2;
  };
  const sortLayer = (level: number, neighbours: (id: string) => string[]) => {
    const row = layers.get(level)!;
    const barycentres = new Map(
      row.map((id) => {
        const adjacent = neighbours(id);
        const centre = adjacent.length
          ? adjacent.reduce(
              (total, parent) => total + horizontalPosition(parent),
              0,
            ) / adjacent.length
          : horizontalPosition(id);
        return [id, centre];
      }),
    );
    row.sort(
      (a, b) =>
        barycentres.get(a)! - barycentres.get(b)! ||
        semanticName(a).localeCompare(semanticName(b)),
    );
  };
  for (let sweep = 0; sweep < 2; sweep++) {
    layerNumbers
      .slice(1)
      .forEach((level) =>
        sortLayer(level, (id) => byId.get(id)!.direct_subarguments),
      );
    layerNumbers
      .slice(0, -1)
      .reverse()
      .forEach((level) => sortLayer(level, (id) => children.get(id) ?? []));
  }
  const nodes: ElementDefinition[] = graph.nodes.map((n) => {
    const row = layers.get(depth(n.data.argumentId))!;
    const index = row.indexOf(n.data.argumentId);
    return {
      ...n,
      data: {
        ...n.data,
        caption: `${n.data.argumentId} · ${n.data.status.toUpperCase()}\n${n.data.label.length > 48 ? n.data.label.slice(0, 47) + "…" : n.data.label}`,
      },
      position: retainedPositions.get(n.data.argumentId) ?? {
        x: (index - (row.length - 1) / 2) * 220,
        y: depth(n.data.argumentId) * 145,
      },
    };
  });
  if (!cy) {
    cy = cytoscape({
      container: container.value,
      elements: [],
      style: styles,
      minZoom: 0.12,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    cy.on("tap", "node", (e: EventObject) =>
      emit("selectArgument", e.target.data("argumentId")),
    );
    cy.on("tap", "edge", (e: EventObject) => emit("selectEdge", e.target.id()));
  }
  cy.batch(() => {
    cy!.elements().remove();
    cy!.add([...nodes, ...graph.edges]);
  });
  cy.layout({ name: "preset", fit: true, padding: 55 }).run();
  updateDisplay();
  previousView = props.view;
}
function updateDisplay() {
  if (!cy) return;
  cy.batch(() => {
    cy!.elements().removeClass("filtered chosen");
    if (!props.showSupport) cy!.edges('[kind="support"]').addClass("filtered");
    if (!props.showDefeat) cy!.edges('[kind!="support"]').addClass("filtered");
    if (props.selectedArgument) {
      const selected = cy!.getElementById(`argument:${props.selectedArgument}`);
      selected.addClass("chosen");
      if (props.focus) {
        const neighbourhood = selected.closedNeighborhood();
        cy!.elements().difference(neighbourhood).addClass("filtered");
      }
    }
    if (props.selectedEdge)
      cy!.getElementById(props.selectedEdge).addClass("chosen");
  });
  emit("visibleCount", cy.nodes(":visible").length);
}
function fit() {
  cy?.fit(cy.elements(":visible"), 55);
}
function zoom(factor: number) {
  if (!cy || !container.value) return;
  cy.zoom({
    level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor)),
    renderedPosition: {
      x: container.value.clientWidth / 2,
      y: container.value.clientHeight / 2,
    },
  });
}
function exportPng() {
  if (!cy) return;
  const link = document.createElement("a");
  link.href = cy.png({
    bg: "#f9fbfc",
    full: true,
    scale: 2,
    maxWidth: 6000,
    maxHeight: 6000,
  });
  link.download = "aspic-argument-graph.png";
  link.click();
}
onMounted(() => {
  draw();
  observer = new ResizeObserver(() => {
    cy?.resize();
  });
  if (container.value) observer.observe(container.value);
});
watch(() => props.view, draw);
watch(
  () => [
    props.selectedArgument,
    props.selectedEdge,
    props.showSupport,
    props.showDefeat,
    props.focus,
  ],
  updateDisplay,
);
onBeforeUnmount(() => {
  observer?.disconnect();
  cy?.destroy();
});
defineExpose({ fit, zoom, exportPng });
</script>

<template>
  <div
    ref="container"
    class="graph-canvas"
    role="img"
    aria-label="ASPIC+ argument graph. Use the Arguments and Relations lists to inspect every node and edge with a keyboard."
  />
</template>
