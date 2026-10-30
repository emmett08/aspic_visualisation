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

This keeps solver semantics and observation acquisition in EAL. The default static app has no service dependency, cross-origin API or second ASPIC+ implementation. Its small grounded-label check validates the supplied graph; it cannot verify completeness of the graph against the omitted formal theory.

An optional development-only theory editor translates explicit text fields into the existing EAL JSON theory contract. `server/solver-plugin.ts` owns HTTP admission, same-origin checks, bounded uploads and the single-worker slot. `server/solver-process.ts` invokes the operator-selected absolute `ASPIC_SOLVER_EXECUTABLE` path, owns bounded process streams and cancellation, and checks the native process protocol. `ASPIC_SOLVER=1` enables the bridge. There is no executable search or inherited credential environment; the child receives only an empty `PATH`. An optional absolute `EAL_LIMITS_FILE` becomes the fixed `--limits` argument. Browser requests contain exactly one `theory` object and cannot select these process settings.

The native `eal-aspic-solve` binary owns theory admission, construction, solving and checked export. A successful process writes only `aspic-view/3` JSON to stdout. Failure writes only `{error:{code,message}}` to stderr: `invalid_request` exits 2, `incomplete` exits 1 and `unavailable` exits 3. The bridge requires agreement between the exit status and error code, rejects mixed success/error streams and bounds error output to 8 KiB. It returns frontend-compatible `{error:string,code}` failures rather than a graph. Unexpected output or a schema/graph validation failure is a bad gateway response.

Uploads are limited to 64 KiB and ten seconds. Worker stdout is limited to 4 MiB and execution to fifteen seconds. Byte counting precedes strict UTF-8 decoding, so split multibyte characters survive and invalid encoding is rejected. Client disconnect and Vite shutdown cancel the worker and await process close before releasing its slot. The helper assumes the selected pure solver does not spawn descendants. A successful response passes the unchanged `validateAspicView` schema and graph checks before HTTP 200 and enters the same session history as an imported export. The static production build keeps graph inspection and disables evaluation.

The boundary is a versioned, bounded data contract. Ajv validates the committed producer JSON Schema, avoiding a second handwritten field schema. Graph invariants, defeat propagation and grounded labelling are checked independently. An independent application can consume it without importing EAL's evaluator. The app contains no collector configuration or executable EAL source evaluation.

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

Optional `origin.computation` carries a native method result through the same
supplied provenance boundary. The closed outer schema distinguishes its method,
native result status, reasons and method-specific JSON details. The computation
domain module bounds open details before rendering; a dedicated inspector
component displays them as text, separately from authored rationale and
observation identity. It does not infer premise truth, prose correspondence or
graph acceptance from method completion. `structured/1` is identified as
authored support without a formal proof. No solver or collector enters the
browser, and old snapshots omit the optional field without new inferred facts.

Optional `verification_reports` retains each native `grounded/1` report with
its EAL source argument name. Reports are collected from the source map before
graph projection, so a failed or unresolved route remains inspectable even
when no formal argument was constructed. The shared `eal.verification-report/1`
contract distinguishes mathematical, empirical and defeasible targets,
obligation outcomes, source-to-symbol bindings and formula evaluations.
Each wrapper retains the native execution status and reasons. Skipped or
incomplete execution can carry a null report; the viewer displays that absence
without inventing obligation results.
Older snapshots without reports display “Verification not supplied”; the
empty-state notice adds no synthetic verification data or inferred pass.
The wrapper source distinguishes `native_method` reports from
`engarg_assurance` reports attached by EngArg after replaying the matching
execution. Both remain supplied records at this import boundary. A completed
verifier execution can report a failed or unresolved obligation; its execution
status does not replace the report outcome.
Exact quantities use `eal.exact-number/1` string components and are displayed
without conversion to JavaScript numbers. Verification reports containing
unsafe integer JSON numbers are rejected instead of displaying rounded source
values. This check is scoped to the new verification report boundary.
The inspector shows the recorded runtime results separately from authored
status and graph acceptance; `unknown` never becomes a displayed pass.

The alternative of placing reports only on graph nodes would lose the most
useful failure records. A second browser verifier would duplicate EAL's
formula, source and applicability semantics. The chosen extension adds a
bounded optional report list to `aspic-view/3`, preserving old snapshots and
the supplied-provenance boundary. `VerificationReports.vue` owns presentation,
`verification.ts` names the imported report fields, and the shared JSON budget
walker bounds both report details and existing computation details. The browser
does not authenticate observations, reconstruct a contract from prose or
re-evaluate reported predicates.

The EAL producer and viewer retain byte-identical view schemas. Unit tests
check the closed report shape, missing source bindings, exact rational strings,
resource limits and preservation of graph status. Browser tests cover
unconstructed routes, unknown and failed applicability, mathematical scope,
inert source text and a narrow viewport.

Captured execution limits constrain imported graph counts alongside browser policy. Preferred-family completeness and exporter provenance remain supplied assertions; the browser contains no extension enumerator or argument constructor. The optional local bridge delegates these calculations to the reviewed native EAL implementation of `argumentation/aspic/2`. The executable is an operator trust choice; validating its returned graph does not authenticate its identity or supplied provenance.
