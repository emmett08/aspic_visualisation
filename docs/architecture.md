# Architecture and semantics

## Responsibilities

| Layer | Responsibility |
|---|---|
| EAL parser and authored evaluator | Resolve EAL declarations, check observations and local methods; remain the default assessment |
| Opt-in EAL compiler and ASPIC+ method | Construct the bounded formal theory and compute arguments, defeats and grounded labels |
| EAL JSON exporter | Recompute the formal result, require exact equality, project origins and emit `aspic-view/1` |
| TypeScript domain layer | Check imported graph structure and grounded labelling, construct presentation elements and compare snapshots |
| Vue components | Local file import, selection, source inspection, filters and session history |
| Cytoscape.js | Render a single graph, pan/zoom, selection events and image export |

This keeps solver semantics and observation acquisition in Python. The web app has no Python service dependency, cross-origin API or second ASPIC+ implementation. Its small grounded-label check validates the supplied graph; it cannot verify completeness of the graph against the omitted formal theory.

The boundary is a versioned, bounded data contract. Ajv validates the committed producer JSON Schema, avoiding a second handwritten field schema. Graph invariants, defeat propagation and grounded labelling are checked independently. An independent application can consume it without importing EAL's evaluator. The Python package contains no embedded frontend script or style string. The app contains no collector configuration or executable EAL source evaluation.

## One graph

The canonical argument graph retains each constructed argument's identity. Direct derivation edges represent rule application; transitive ancestors are retained as metadata, not rendered as extra direct premises. Defeat edges carry their attack kind and exact attacked subargument, so propagated defeat remains distinguishable from attacking a strict top rule. Defeat cycles are permitted. Derivation cycles are rejected.

Layout is presentation only. Labels and relationships come from the imported assessment; position, proximity and node colour do not supply additional inference. Text labels repeat colour categories. The argument list and relation inspector provide a keyboard alternative to canvas selection.

## Events and comparison

An event records importing or selecting a session snapshot. It is not an engineering event or timestamped observation. The assessment time and source/snapshot digests are displayed separately.

Snapshot comparison identifies a derivation through its semantic origin, rule or premise and immediate subderivations. Solver-local IDs such as `A7` cannot identify the same argument across different compilations. An inserted unrelated premise can renumber all later arguments without changing their meaning. Comparison tests cover this case and shared diamond derivations.

A changed theory or source can change an argument's grounds as well as its label. Added/removed derivations and relabellings are therefore separate findings. A graph diff does not attribute physical causality or establish that one source revision is preferable.

## Alternatives considered

Retaining an embedded Python HTML renderer would couple packaging and UI changes. A browser port of the complete solver would duplicate formal semantics. A live API backend would add deployment, authentication and observation-execution responsibilities that inspection does not require. A static Vue app with local JSON import provides the required graph events and preserves a narrow tested boundary.

Cytoscape.js supplies graph rendering and interaction. Vue single-file components use TypeScript's Composition API; `vue-tsc` checks types independently because Vite transpilation alone does not type-check. Primary documentation: [Vue TypeScript](https://vuejs.org/guide/typescript/overview), [Cytoscape.js](https://js.cytoscape.org/).

Human comprehension, bias mitigation, deskilling, technical debt and inference cost require separate engineering studies. A working graph and passing tests establish none of those effects.
