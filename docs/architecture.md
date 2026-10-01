# Architecture and semantics

## Responsibilities

| Layer | Responsibility |
|---|---|
| EAL parser and authored evaluator | Resolve EAL declarations, check observations and local methods; remain the default assessment |
| Opt-in EAL compiler and ASPIC+ method | Construct the bounded formal theory and compute finite arguments, defeats, selected extensions and query status |
| EAL JSON exporter | Recompute the formal result, require exact equality, project origins and emit `aspic-view/3` |
| TypeScript domain layer | Check graph structure, grounded labelling, supplied extension validity and query consistency, construct presentation elements and compare snapshots |
| Vue components | Local file import, selection, source inspection, filters and session history |
| Cytoscape.js | Render a single graph, pan/zoom, selection events and image export |

This keeps solver semantics and observation acquisition in Python. The default static app has no Python service dependency, cross-origin API or second ASPIC+ implementation. Its small grounded-label check validates the supplied graph; it cannot verify completeness of the graph against the omitted formal theory.

An optional development-only theory editor translates explicit text fields into the existing EAL JSON theory contract. `server/solver-plugin.ts` passes a bounded JSON request to `server/solve.py`; that bridge calls the pinned EAL solver and checked exporter. No solver algorithm is copied into TypeScript. This deliberately adds no collector execution, source-language parsing, implicit contraries or preference-policy inference. A successful evaluation enters the same validated view and session history as an imported export. The static production build keeps graph inspection and disables evaluation.

The boundary is a versioned, bounded data contract. Ajv validates the committed producer JSON Schema, avoiding a second handwritten field schema. Graph invariants, defeat propagation and grounded labelling are checked independently. An independent application can consume it without importing EAL's evaluator. The Python package contains no embedded frontend script or style string. The app contains no collector configuration or executable EAL source evaluation.

## One graph

The canonical argument graph retains each constructed argument's identity. Direct derivation edges represent rule application; transitive ancestors are retained as metadata, not rendered as extra direct premises. Defeat edges carry their attack kind and exact attacked subargument, so propagated defeat remains distinguishable from attacking a strict top rule. Defeat cycles are permitted. Derivation cycles are rejected.

Layout is presentation only. Labels and relationships come from the imported assessment; position, proximity and node colour do not supply additional inference. Text labels repeat colour categories. The argument list and relation inspector provide a keyboard alternative to canvas selection.

## Events and comparison

An event records importing or evaluating a session snapshot. It is not an engineering event or timestamped observation. The assessment time and source/snapshot digests are displayed separately.

Snapshot comparison identifies a derivation through its semantic origin, rule or premise and immediate subderivations. Solver-local IDs such as `A7` cannot identify the same argument across different compilations. An inserted unrelated premise can renumber all later arguments without changing their meaning. Comparison tests cover this case and shared diamond derivations.

A changed theory or source can change an argument's grounds as well as its label. Added/removed derivations and relabellings are therefore separate findings. A graph diff does not attribute physical causality or establish that one source revision is preferable.

## Alternatives considered

Retaining an embedded Python HTML renderer would couple packaging and UI changes. A browser port of the complete solver would duplicate formal semantics. A live API backend would add deployment, authentication and observation-execution responsibilities that inspection does not require. A static Vue app with local JSON import provides the required graph events and preserves a narrow tested boundary.

Cytoscape.js supplies graph rendering and interaction. Vue single-file components use TypeScript's Composition API; `vue-tsc` checks types independently because Vite transpilation alone does not type-check. Primary documentation: [Vue TypeScript](https://vuejs.org/guide/typescript/overview), [Cytoscape.js](https://js.cytoscape.org/).

Human comprehension, bias mitigation, deskilling, technical debt and inference cost require separate engineering studies. A working graph and passing tests establish none of those effects.

## Extension inspection and evidence groups

The canonical snapshot preserves grounded labels and selected query metadata. Choosing an extension computes presentation labels from that supplied set and its outgoing defeats; imports and event restoration reset the selection. Exported snapshots remain unchanged. Minimum numerical `strength` remains a descriptive field when a last-link preference is active.

Availability groups use typed causes, never reason-text inference. Missing observations, failed predicates, stale observations, collection errors, invalid observations and scope mismatches remain distinct. One record may occur in multiple groups when it carries multiple supplied issues; grouping adds no premise. Source-file and conditional transfer metadata are displayed as supplied records.

Captured execution limits constrain imported graph counts alongside browser policy. Preferred-family completeness and exporter provenance remain supplied assertions; the browser contains no extension enumerator or argument constructor. The optional local bridge delegates these calculations to `argumentation/aspic/2`, implementation `eal-aspic-finite-5`, package 3.1.0.
