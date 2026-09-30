"""Exercise the real process boundary and pinned EAL implementation."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEMO = {
    "premises": [
        {"atom": "report_record", "kind": "axiom"},
        {"atom": "latency_record", "kind": "ordinary", "rank": 500},
        {"atom": "gap_record", "kind": "ordinary", "rank": 500},
        {"atom": "probe_record", "kind": "ordinary", "rank": 700},
    ],
    "rules": [
        {"id": "report", "kind": "strict", "antecedents": ["report_record"], "consequent": "report_checked"},
        {"id": "latency", "kind": "defeasible", "antecedents": ["latency_record"], "consequent": "latency_ok", "name": "applicable_latency", "rank": 500},
        {"id": "primary", "kind": "defeasible", "antecedents": ["latency_ok", "report_checked"], "consequent": "run_passes", "name": "applicable_primary", "rank": 500},
        {"id": "gap", "kind": "defeasible", "antecedents": ["gap_record"], "consequent": "trace_gap", "name": "applicable_gap", "rank": 500},
        {"id": "probe", "kind": "defeasible", "antecedents": ["probe_record"], "consequent": "run_passes", "name": "applicable_probe", "rank": 700},
    ],
    "contraries": [{"attacker": "trace_gap", "target": "applicable_primary"}],
    "goal": "run_passes",
}


def invoke(value=None, *, raw=None):
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [
        str(ROOT / ".runtime/eal-source/src"),
        str(ROOT / ".runtime/python"),
        env.get("PYTHONPATH", ""),
    ]))
    return subprocess.run(
        [sys.executable, str(ROOT / "server/solve.py")],
        input=raw if raw is not None else json.dumps(value).encode(),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=15,
    )


class BridgeTests(unittest.TestCase):
    def test_engineering_undercut_preserves_alternative_route(self):
        result = invoke({"theory": DEMO})
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        view = json.loads(result.stdout)
        self.assertEqual(view["schema"], "aspic-view/2")
        self.assertEqual(view["formal_status"], "accepted")
        self.assertEqual(view["validation"]["formal_result"], "recomputed")
        self.assertIsNone(view["claim_status"])
        by_rule = {a.get("rule_id"): a for a in view["arguments"] if "rule_id" in a}
        self.assertEqual(by_rule["primary"]["label"], "out")
        self.assertEqual(by_rule["probe"]["label"], "in")
        self.assertEqual(len(view["arguments"]), 9)
        self.assertEqual(view["defeats"], [{
            "attacker": by_rule["gap"]["id"], "target": by_rule["primary"]["id"],
            "subargument": by_rule["primary"]["id"], "kind": "undercut",
        }])

    def test_rejects_invalid_envelope(self):
        result = invoke({"theory": DEMO, "command": "anything"})
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"exactly one theory", result.stderr)

    def test_rejects_cycle(self):
        theory = copy.deepcopy(DEMO)
        theory["rules"].append({"id": "loop", "kind": "strict", "antecedents": ["run_passes"], "consequent": "latency_record"})
        result = invoke({"theory": theory})
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"atom cycle", result.stderr)

    def test_rejects_premise_bound(self):
        theory = {"premises": [{"atom": f"p{i}", "kind": "axiom"} for i in range(65)], "rules": [], "contraries": [], "goal": "p0"}
        result = invoke({"theory": theory})
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"premises", result.stderr)

    def test_rejects_request_bound(self):
        result = invoke(raw=b" " * (64 * 1024 + 1))
        self.assertEqual(result.returncode, 2)
        self.assertIn(b"64 KiB", result.stderr)

    def test_rejects_ambiguous_or_non_json_inputs(self):
        for raw in [b'{"theory":{},"theory":{}}', b'{"theory":NaN}', b"not-json"]:
            with self.subTest(raw=raw):
                result = invoke(raw=raw)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, b"")
                self.assertNotIn(b"Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
