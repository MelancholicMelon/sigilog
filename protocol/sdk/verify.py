import json
import requests

from protocol.envelope.canon import canonical
from protocol.envelope.crypto import sha256_hex, ed25519_verify, unseal_payload, b64url_decode
from protocol.envelope.envelope import build_sign_input, compute_content_hash_plaintext
from protocol.identity.registry import get_agent


RELAY_BASE = "http://localhost:8080"


def _ledger_has_hash(envelope_hash: str) -> bool:
    try:
        r = requests.get(f"{RELAY_BASE}/ledger/exists/{envelope_hash}", timeout=3)
        return r.json().get("exists", False)
    except Exception:
        return False


def verify(envelope: dict, registry: dict) -> dict:
    """
    4-step verification per envelope.schema.md §4.
    Returns {ok: True} or {ok: False, error_code: str, detail: str}.
    """
    try:
        header = envelope.get("header", {})
        provenance = envelope.get("provenance", {})
        payload = envelope.get("payload", {})
        content_hash = envelope.get("content_hash")
        signature = envelope.get("signature")

        if not all([header, provenance, payload, content_hash, signature]):
            return {"ok": False, "error_code": "ERR_MALFORMED", "detail": "missing required fields"}
    except Exception as e:
        return {"ok": False, "error_code": "ERR_MALFORMED", "detail": str(e)}

    # Step 1: sender in registry
    sender_id = header.get("sender_id")
    agent_entry = get_agent(registry, sender_id)
    if not agent_entry:
        return {"ok": False, "error_code": "ERR_UNKNOWN_SENDER", "detail": f"sender {sender_id!r} not in registry"}

    # Step 2: verify signature
    sign_input = build_sign_input(header, provenance, content_hash)
    if not ed25519_verify(agent_entry["public_key"], sign_input.encode(), signature):
        return {"ok": False, "error_code": "ERR_SIG_INVALID", "detail": "signature does not verify"}

    # Step 3: recompute content_hash (only for PLAINTEXT; for SEALED caller must unseal first)
    if payload.get("mode") == "PLAINTEXT":
        expected_hash = compute_content_hash_plaintext(payload.get("content", {}))
        if expected_hash != content_hash:
            return {"ok": False, "error_code": "ERR_HASH_MISMATCH", "detail": "content_hash mismatch"}

    # Step 4: parent hashes exist in ledger
    for ph in provenance.get("parent_hashes", []):
        if not _ledger_has_hash(ph):
            return {"ok": False, "error_code": "ERR_PARENT_NOT_FOUND", "detail": f"parent {ph!r} not in ledger"}

    return {"ok": True}


def verify_sealed_content_hash(envelope: dict, plaintext_bytes: bytes) -> dict:
    """After unsealing, verify the content_hash against the plaintext."""
    expected = sha256_hex(plaintext_bytes)
    if expected != envelope["content_hash"]:
        return {"ok": False, "error_code": "ERR_HASH_MISMATCH", "detail": "sealed content_hash mismatch after unseal"}
    return {"ok": True}
