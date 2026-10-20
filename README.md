# ASPIC+ visualisation

A Vue 3 and TypeScript workbench for inspecting bounded ASPIC+ argument assessments. One graph shows **direct derivations and defeats together**. Select an argument or defeat to inspect its grounds, label, attacked subargument and supplied EAL source mapping.

The bundled API load-test example is synthetic. Its primary route is undercut by a trace-gap objection; an independent probe still supports the conclusion.

![One graph with support, defeat and source inspection](docs/screenshot.png)

## Run locally

Requires Node.js 22.12 or later (Node 24 is used in CI).

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open the printed local address. Snapshot files are parsed in the browser and are not uploaded. No backend, account, API key or external assets are required. After building, serve `dist/` using `npm run preview` or a static web server; opening `index.html` through `file://` is not supported.

### Optional theory editor

To construct arguments from the text areas, install `eal-aspic-solve` from the reviewed [native EAL checkout](https://github.com/emmett08/eal-mcp), then select that executable explicitly. From this app's directory:

```sh
cargo install --locked --path /absolute/path/to/eal-mcp/crates/eal-cli \
  --bin eal-aspic-solve --root "$PWD/.runtime/native"
ASPIC_SOLVER=1 ASPIC_SOLVER_EXECUTABLE="$PWD/.runtime/native/bin/eal-aspic-solve" \
  npm run dev -- --host 127.0.0.1
```

Use the paired native producer revision containing this binary. `ASPIC_SOLVER_EXECUTABLE` must be an absolute path; the bridge never searches `PATH`. A missing or invalid executable leaves evaluation unavailable. Select **Load engineering demo**, then **Build graph**. The pump example has a test-based route undercut by vibration evidence and a surviving inspection route. Successful evaluations add session snapshots; failed edits preserve the current graph.

Enter one element per line:

| Field | Example | Meaning |
| --- | --- | --- |
| Axioms | `voltage_ok` | Infallible premise in this formal model |
| Ordinary premises | `inspection_ok @ 700` | Fallible premise with a global rank |
| Strict rules | `s1: voltage_ok -> power_ok` | Strict inference |
| Defeasible rules | `d1: test_pass, power_ok => pump_ready @ 500` | Defeasible inference, named `applicable_d1` for undercuts |
| Named defeasible rules | `d1 [use_primary]: test_pass => pump_ready @ 500` | Explicit positive applicability atom `use_primary`; an undercut targets that atom |
| Contraries | `unreliable_test -> applicable_d1` | Directed contrary; add the reverse line explicitly for a reciprocal pair |
| Goal | `pump_ready` | Atom queried under the selected extension semantics |

Omitted ranks default to 500; larger ranks are stronger. Select minimum-rank, last-link numerical or last-link partial preference. Partial priorities use lines such as `rule d3 > d1` or `premise p > q`. `~p` is an atom spelling: it does not automatically create a contrary relation. The finite profile constructs premise-founded cyclic theories without repeating a conclusion along a branch. Select grounded, preferred or stable semantics and a credulous or sceptical query. An empty stable family is reported as `no_extension`, never accepted. Its text notation is a UI adapter to EAL's existing JSON theory contract; it does not change EAL grammar.

Only explicitly submitted theories are sent to the selected native process. The bridge delegates construction and checked export to EAL, then applies the same schema and graph checks used for imported files before returning success. It accepts same-origin requests one at a time, with a 64 KiB upload limit, 10-second upload deadline, 4 MiB response limit and 15-second worker deadline. Disconnecting or closing Vite terminates the worker; the concurrency slot is released after the process closes. The worker receives a closed environment with an empty `PATH`, without inherited credentials. The bridge is disabled by default and absent from the production static build; keep it on a trusted local development host. Production hosting of a solver service requires a separate deployment design.

## Bring an EAL assessment

Use the native EAL checked exporter on a completed compile response:

```sh
# Save the complete compile-aspic response as result.json.
eal-core export-aspic result.json > view.json
```

Import `view.json` in this app. Explicit formal theories can use the same EAL exporter with JSON containing `theory` and `formal`. The app consumes the versioned [`aspic-view/3` JSON contract](schema/aspic-view.schema.json), not EAL source text.

- Solid derivation edges connect an immediate subargument to the argument using it. Reused evidence remains one node.
- Dashed defeat edges connect attacker to defeated argument. The inspector identifies the exact attacked subargument and whether the defeat undermines, rebuts or undercuts.
- `in`, `out` and `undecided` initially show grounded graph labels. **Graph labelling** can inspect each supplied extension. Selected query acceptance is displayed separately; labels are graph-relative, not truth values. A strict inference may still depend on fallible premises.
- Source text, rationale, declaration location, observation metadata and review references remain inspectable. Unavailable evidence has typed causes such as `missing_observation`, `stale_observation` and `predicate_not_met`; an observed failed condition remains distinct from an absent observation. These entries never become negative premises.
- Search and the argument list provide keyboard access to graph selection. Relation filters and neighbourhood focus make hidden graph content explicit.
- Import successive snapshots to record session events and compare added, removed and relabelled derivations. Restoring an event restores its graph. Import order is not evidence chronology or a solver execution trace; differing source or assessment identities remain visible.

EAL's newline-based source notation supports scoped metadata and typed pattern instances. For example, an argument using `[premises measured] via rule => reportable` depends on a claim that another argument or `apply` instance establishes. The exporter constructs these nested derivations, and this app displays their immediate links and shared evidence. EAL/3 also supports modules, source imports, local block arguments, compound patterns, decreasing typed-list recursion, pure expressions and explicit conditional scope transfer. Reviewed `strict`, `rank`, `contrary` and `prefer` directives retain their formal-compilation meaning; ordinary EAL claim assessment is a separate contract.

The import contract is `aspic-view/3`, matching the producer schema exactly. Compatible existing EAL exports remain importable; regenerate older schema versions before importing them.

## Trust boundary

EAL recomputes the bounded formal theory and requires exact agreement with the supplied solver result before exporting. It checks supplied source-map structure but does not authenticate observations or establish correspondence between English statements and formal atoms.

The browser validates the contract, budgets, graph references, derivation closure, grounded labels, supplied extension conflict-freedom/defence/stability and query consistency. It does not establish maximality or completeness of a supplied preferred-extension family. It does **not** construct an ASPIC+ theory, check that every warranted defeat was exported, recollect evidence, or authenticate the exporter. An export's validation field is a supplied assertion, not a signature. Browser import policy allows up to 4 MiB, 4,096 arguments and 65,536 defeat witnesses, also constrained by the captured host budgets. These browser limits do not raise solver budgets.

The default app inspects exports; the optional local editor delegates evaluation to the existing solver. Neither changes EAL's default evaluator. PyArg is an inspiration for interactive argument inspection; this app does not claim all of PyArg's theory editing, preference policies or extension semantics.

## Development

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
# Separate integration suite: requires the installed native solver.
ASPIC_SOLVER_EXECUTABLE=/absolute/path/to/eal-aspic-solve npm run test:browser:native
```

Dependencies are pinned and `package-lock.json` is committed. Normal type, unit, build and static browser checks require no Python or EAL installation. The HTTP unit suite uses a standalone Node fixture process on the Linux test host; the separate native browser suite exercises the installed solver without mocked responses. The GitHub validation workflow is manual-only. See [architecture](docs/architecture.md) for the module boundary and comparison rules. Vue text interpolation and Cytoscape labels render imported values as text; imported HTML is never executed.

The bundled engineering snapshot is generated from EAL/3 source by the companion
compiler, including a typed pattern instance, nested premise derivations and reviewed
ASPIC+ annotations. [Cloud browser verification and screenshots](docs/verification-eal31.md)
record an actual local import of this sample.

The companion `examples/aspic-keywords` example also supplies full source-directive
and explicit-theory exports. [Reproducible fixtures](tests/fixtures/README.md) cover
all four reviewed directive kinds, all three defeat kinds, negative literals and
two preferred extensions. Explicit applicability names in the theory editor
preserve the same undercut targets when rebuilding that example.

[Cloud-browser captures and verification](docs/verification-aspic-keywords.md) show
the exact theory rebuilt through the live solver, both preferred extensions and
all reviewed source directives.

The optional bridge accepts an operator-owned budget file through `EAL_LIMITS_FILE=/absolute/path/limits.toml`, passed to the binary as `--limits`. Its `[limits]` table can raise solver construction or extension-search budgets; browser requests cannot change this path or the executable. Solver exhaustion reports an incomplete calculation and preserves the current graph. Invalid requests, incomplete calculations and unavailable workers remain distinct errors. Request bytes, response bytes, upload deadline and worker deadline remain separately bounded.

Unavailable evidence is grouped by typed cause, preserving the distinction between a failed predicate and an absent observation. The useful grouping behaviour and checks from PR #3 are incorporated here; [its earlier captures](docs/evidence-outcomes/README.md) remain labelled as historical. No legacy import adapter is included.
