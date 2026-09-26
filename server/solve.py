"""JSON process adapter for EAL's pinned bounded ASPIC+ implementation.

The development server owns HTTP, deadlines and concurrency. This adapter owns
only the request boundary; argument construction and export stay in EAL.
Run with the reviewed EAL package installed, or its src directory on PYTHONPATH.
"""
from __future__ import annotations

import json
import sys

EAL_REVISION = "a31d2cf05c8ef5145612c53a46650faf89a80bc0"
EXPECTED_IMPLEMENTATION = "eal-aspic-grounded-4"
MAX_REQUEST_BYTES = 64 * 1024


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def _finite_json(value):
    raise ValueError(f"Non-finite JSON number is not supported: {value}")


def solve_request(raw: bytes) -> dict:
    if len(raw) > MAX_REQUEST_BYTES:
        raise ValueError("Theory request exceeds the 64 KiB limit")
    payload = json.loads(raw, object_pairs_hook=_unique_object, parse_constant=_finite_json)
    if type(payload) is not dict or set(payload) != {"theory"}:
        raise ValueError("Request must contain exactly one theory object")

    from eal.aspic import ASPIC_CONTRACT
    from eal.aspic_export import export_aspic_view
    from eal.methods import execute_extension

    if ASPIC_CONTRACT.implementation_version != EXPECTED_IMPLEMENTATION:
        raise RuntimeError("Install the reviewed EAL revision " + EAL_REVISION)
    computation = execute_extension(ASPIC_CONTRACT, payload)
    if computation["status"] != "supported":
        raise ValueError("; ".join(computation["reasons"]))
    return export_aspic_view({
        "theory": payload["theory"],
        "formal": computation["details"],
        "profile": ASPIC_CONTRACT.identifier,
    })


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        view = solve_request(raw)
        sys.stdout.write(json.dumps(view, ensure_ascii=False, allow_nan=False))
        sys.stdout.write("\n")
        return 0
    except ModuleNotFoundError:
        sys.stderr.write("Solver runtime unavailable. Install the pinned EAL package and its dependencies.\n")
        return 3
    except (ValueError, TypeError, UnicodeError, RecursionError, OverflowError) as exc:
        sys.stderr.write("Invalid or unsupported theory: " + str(exc)[:1800] + "\n")
        return 2
    except (RuntimeError, OSError) as exc:
        sys.stderr.write("Solver unavailable: " + str(exc)[:1800] + "\n")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
