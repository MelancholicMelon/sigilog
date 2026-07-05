import json


def canonical(obj) -> str:
    """Canonical JSON: keys sorted alphabetically, no whitespace, UTF-8."""
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
