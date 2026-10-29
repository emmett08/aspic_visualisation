# Native EAL/4 fixture

`eal4-native/view.json` is a checked native export generated from the committed
`eal4-native/case.eal` source. The records are synthetic: one test supplies
`{"passed":true}`, a second supplies `{}` so its predicate is unresolved, and
a third has no observation, leaving its dependent calculation unavailable.
The graph retains the successful route and the unavailable records remain
distinct from negative premises.

The fixture was generated with `emmett08/eal-mcp` revision
`adec34852ac2f74a559ec0c83843fcf4907b2695`. Regenerate it with an installed
native binary from that revision:

```sh
EAL_CORE_EXECUTABLE=/absolute/path/to/eal-core node tests/fixtures/eal4-native/regenerate.mjs
```

The script constructs fixed synthetic record identities, runs `compile-aspic`
and then `export-aspic`, and writes the unmodified native JSON output. Unit tests
pass that output through `parseAspicView`, including Ajv, captured budgets and
graph checks. Browser tests import the same file and inspect its evidence
groups. No evidence collection or external service is involved.

# Historical ASPIC+ keyword fixtures

The three `aspic-keywords-*.json` fixtures come from the companion EAL
`examples/aspic-keywords` example. Every record describes a fixed synthetic run.
These views and the bundled `src/domain/sample.json` and `scoped-review.json`
pre-date the native producer's required `method_work` field. Their fixture
limits now include its default value of 1,000,000,000 so the existing graph
regressions use the current contract. The graphs and historical supplied source
metadata are unchanged; these migrated fixtures are not fresh native exports.

| Fixture | Producer | Coverage |
| --- | --- | --- |
| `aspic-keywords-compiled.json` | `output/compiled-view.json` | Reviewed `strict`, `rank`, `contrary` and `prefer` source directives; 15 arguments and 6 defeats |
| `aspic-keywords-formal.json` | `output/formal-view.json` | Explicit applicability names, negative literals, all three defeat kinds, propagated defeats and two preferred extensions; 15 arguments and 10 defeats |
| `aspic-keywords-theory.json` | `fixture.json` → `theory` | Complete explicit input for the editor round-trip test |

The original Python producer recipe is retained below for the historical
graphs. It requires a compatible historical sibling EAL checkout; the current
native EAL/4 runtime uses the recipe above. The added budget is a fixture
migration, not a budget captured by that earlier producer:

```sh
PYTHONPATH=../earl/src python ../earl/examples/aspic-keywords/demo.py --output /tmp/aspic-keywords
python - <<'PY'
import json
from pathlib import Path

for kind in ('compiled', 'formal'):
    value = json.loads(Path(f'/tmp/aspic-keywords/{kind}-view.json').read_text())
    value['execution_limits']['method_work'] = 1_000_000_000
    Path(f'tests/fixtures/aspic-keywords-{kind}.json').write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + '\n')
theory = json.loads(Path('../earl/examples/aspic-keywords/fixture.json').read_text())['theory']
Path('tests/fixtures/aspic-keywords-theory.json').write_text(
    json.dumps(theory, indent=2, ensure_ascii=False) + '\n')
PY
```

The unit tests validate both exporter views and reconstruct the complete input
theory through the editor notation. The browser tests import the same views,
inspect the source directives and exact attacked subarguments, and switch
between grounded labels and both preferred extensions.

The inherited `scoped-review.json` fixture covers compound recursive patterns
and reviewed partial priorities. All fixtures contain supplied provenance;
import validation does not authenticate those records.
