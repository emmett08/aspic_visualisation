# ASPIC+ keyword fixtures

The three `aspic-keywords-*.json` fixtures come from the companion EAL
`examples/aspic-keywords` example. Every record describes a fixed synthetic run.

| Fixture | Producer | Coverage |
| --- | --- | --- |
| `aspic-keywords-compiled.json` | `output/compiled-view.json` | Reviewed `strict`, `rank`, `contrary` and `prefer` source directives; 15 arguments and 6 defeats |
| `aspic-keywords-formal.json` | `output/formal-view.json` | Explicit applicability names, negative literals, all three defeat kinds, propagated defeats and two preferred extensions; 15 arguments and 10 defeats |
| `aspic-keywords-theory.json` | `fixture.json` → `theory` | Complete explicit input for the editor round-trip test |

With the EAL package and its dependencies installed, regenerate from a sibling
EAL checkout:

```sh
PYTHONPATH=../earl/src python ../earl/examples/aspic-keywords/demo.py --output /tmp/aspic-keywords
python - <<'PY'
import json
from pathlib import Path

for kind in ('compiled', 'formal'):
    value = json.loads(Path(f'/tmp/aspic-keywords/{kind}-view.json').read_text())
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
