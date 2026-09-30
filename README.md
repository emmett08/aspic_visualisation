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

Open the printed local address. Files are parsed in the browser and are not uploaded. No backend, account, API key or external assets are required. After building, serve `dist/` using `npm run preview` or a static web server; opening `index.html` through `file://` is not supported.

### Optional theory editor

To construct arguments from the text areas, install Python 3.11+ and the pinned companion EAL/3 implementation, then enable the development-only bridge:

```sh
python3 -m venv .venv
.venv/bin/pip install 'engineering-argument-language @ git+https://github.com/emmett08/earl.git@7376526d5f0fd497cd41b25a1544c5fbb6e498ff'
ASPIC_SOLVER=1 ASPIC_PYTHON="$PWD/.venv/bin/python" npm run dev -- --host 127.0.0.1
```

Repository access is required to install that revision. Alternatively, install that exact checked-out EAL revision into the virtual environment. Select **Load engineering demo**, then **Build graph**. The pump example has a test-based route undercut by vibration evidence and a surviving inspection route. Successful evaluations add session snapshots; failed edits preserve the current graph.

Enter one element per line:

| Field | Example | Meaning |
| --- | --- | --- |
| Axioms | `voltage_ok` | Infallible premise in this formal model |
| Ordinary premises | `inspection_ok @ 700` | Fallible premise with a global rank |
| Strict rules | `s1: voltage_ok -> power_ok` | Strict inference |
| Defeasible rules | `d1: test_pass, power_ok => pump_ready @ 500` | Defeasible inference, named `applicable_d1` for undercuts |
| Contraries | `unreliable_test -> applicable_d1` | Directed contrary; add the reverse line explicitly for a reciprocal pair |
| Goal | `pump_ready` | Atom whose grounded status is reported |

Omitted ranks default to 500; larger ranks are stronger. EAL uses the minimum rank across fallible premises and rules, not selectable PyArg preference orderings. `~p` is an atom spelling: it does not automatically create a contrary relation. The editor is a bounded ASPIC+ profile with acyclic premise-to-conclusion dependencies, not a general logic or EAL prose parser. Its text notation is a UI adapter to EAL's existing JSON theory contract; it does not change EAL grammar.

Only explicitly submitted theories are sent to the local Python process. The bridge delegates construction and checked export to EAL, enforces a 64 KiB request limit and 15-second deadline, and accepts same-origin requests one at a time. It does not run collectors. It is disabled by default and absent from the production static build; keep it on a trusted local development host. Production hosting of a solver service requires a separate deployment design.

## Bring an EAL assessment

Use the pinned companion EAL/3 implementation from [EAL PR #49](https://github.com/emmett08/earl/pull/49):

```sh
# In an EAL workspace, save the full compile-aspic response as result.json.
eal --workspace . export-aspic result.json --output view.json
```

Or generate the maintained synthetic example from the EAL repository:

```sh
python examples/api-load-test/aspic_compiled_demo.py --export-view /tmp/view.json
```

Import `view.json` in this app. Explicit formal theories can use the same EAL exporter with JSON containing `theory` and `formal`. The app consumes the versioned [`aspic-view/2` JSON contract](schema/aspic-view.schema.json), not EAL source text.

- Solid derivation edges connect an immediate subargument to the argument using it. Reused evidence remains one node.
- Dashed defeat edges connect attacker to defeated argument. The inspector identifies the exact attacked subargument and whether the defeat undermines, rebuts or undercuts.
- `in`, `out` and `undecided` are grounded labels, not truth values. A strict inference may still depend on fallible premises.
- Source text, rationale, declaration location, observation metadata and review references remain inspectable. Unavailable evidence has typed causes such as `missing_observation`, `stale_observation` and `predicate_not_met`; an observed failed condition remains distinct from an absent observation. These entries never become negative premises.
- Search and the argument list provide keyboard access to graph selection. Relation filters and neighbourhood focus make hidden graph content explicit.
- Import successive snapshots to record session events and compare added, removed and relabelled derivations. Restoring an event restores its graph. Import order is not evidence chronology or a solver execution trace; differing source or assessment identities remain visible.

EAL's newline-based source notation supports scoped metadata and typed pattern instances. For example, an argument using `[premises measured] via rule => reportable` depends on a claim that another argument or `apply` instance establishes. The exporter constructs these nested derivations, and this app displays their immediate links and shared evidence. Inline nested argument declarations and recursive or nested pattern applications are outside EAL's grammar. Reviewed `strict`, `rank` and `contrary` directives retain their formal-compilation meaning; ordinary EAL claim assessment is a separate contract.

The import contract is `aspic-view/2`, matching the producer schema exactly. Regenerate older exports with the pinned EAL implementation before importing them.

## Trust boundary

EAL recomputes the bounded formal theory and requires exact agreement with the supplied solver result before exporting. It checks supplied source-map structure but does not authenticate observations or establish correspondence between English statements and formal atoms.

The browser validates the import contract, resource bounds, graph references, derivation closure and grounded labels against the imported defeat graph. It does **not** construct an ASPIC+ theory, check that every warranted defeat was exported, recollect evidence, or authenticate the exporter. An export's validation field is a supplied assertion, not a signature. Files are bounded to 4 MiB, 128 arguments and 4,096 defeat witnesses.

The default app inspects exports; the optional local editor delegates evaluation to the existing solver. Neither changes EAL's default evaluator. PyArg is an inspiration for interactive argument inspection; this app does not claim all of PyArg's theory editing, preference policies or extension semantics.

## Development

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
# With the pinned EAL runtime installed in .venv:
.venv/bin/python -m unittest server/test_solve.py
```

Dependencies are pinned and `package-lock.json` is committed. See [architecture](docs/architecture.md) for the module boundary and comparison rules. Vue text interpolation and Cytoscape labels render imported values as text; imported HTML is never executed.

The bundled engineering snapshot is generated from EAL/3 source by the companion
compiler, including a typed pattern instance, nested premise derivations and reviewed
ASPIC+ annotations. [Cloud browser verification and screenshots](docs/verification-eal3.md)
record an actual local import of this sample.
