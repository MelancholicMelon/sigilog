import json
import requests

from protocol.envelope.envelope import (
    build_plaintext_envelope,
    build_sealed_envelope,
    compute_envelope_hash,
)
from protocol.envelope.crypto import unseal_payload
from protocol.envelope.canon import canonical
from protocol.envelope.crypto import sha256_hex
from protocol.identity.registry import load_registry, get_agent
from protocol.sdk.verify import verify, verify_sealed_content_hash

RELAY_BASE = "http://localhost:8080"


def send(sender_identity: dict, recipient_ids: list, message_type: str,
         content: dict, parent_hashes: list = None, seal: bool = False) -> dict:
    """
    Build, sign, (optionally seal), and POST envelope to relay /send.
    Returns the full envelope (including envelope_hash) for use as future parent.
    """
    if parent_hashes is None:
        parent_hashes = []

    hop_history = [sender_identity["agent_id"]]
    registry = load_registry()

    if seal:
        if len(recipient_ids) != 1:
            raise ValueError("Sealed envelopes must have exactly one recipient")
        recipient = get_agent(registry, recipient_ids[0])
        if not recipient:
            raise ValueError(f"Recipient {recipient_ids[0]} not in registry")
        envelope = build_sealed_envelope(
            sender_id=sender_identity["agent_id"],
            recipient_ids=recipient_ids,
            message_type=message_type,
            content=content,
            parent_hashes=parent_hashes,
            hop_history=hop_history,
            private_key_b64=sender_identity["private_key"],
            recipient_seal_public_key_b64=recipient["seal_public_key"],
        )
    else:
        envelope = build_plaintext_envelope(
            sender_id=sender_identity["agent_id"],
            recipient_ids=recipient_ids,
            message_type=message_type,
            content=content,
            parent_hashes=parent_hashes,
            hop_history=hop_history,
            private_key_b64=sender_identity["private_key"],
        )

    # Strip envelope_hash before sending — B hashes the received body to produce
    # the authoritative hash; including our locally-computed field would make B's
    # hash differ from ours, breaking parent-hash lookups.
    wire = {k: v for k, v in envelope.items() if k != "envelope_hash"}
    r = requests.post(f"{RELAY_BASE}/send", json=wire, timeout=10)
    r.raise_for_status()
    # Use B's authoritative hash for parent tracking (same value since wire is 5-field)
    envelope["envelope_hash"] = r.json().get("envelope_hash", envelope.get("envelope_hash"))
    return envelope


def receive(identity: dict) -> list:
    """Poll relay /inbox/<agent_id>; returns list of unverified envelopes."""
    r = requests.get(f"{RELAY_BASE}/inbox/{identity['agent_id']}", timeout=10)
    r.raise_for_status()
    return r.json()


def verify_envelope(envelope: dict, registry: dict = None) -> dict:
    """4-step verification. Returns {ok, error_code?, detail?}."""
    if registry is None:
        registry = load_registry()
    return verify(envelope, registry)


def open_envelope(envelope: dict, identity: dict) -> dict:
    """Unseal a SEALED envelope. Reports OPENED to relay."""
    payload = envelope.get("payload", {})
    if payload.get("mode") != "SEALED":
        raise ValueError("open() called on non-SEALED envelope")

    recipient_id = payload.get("seal_info", {}).get("recipient_id")
    if recipient_id != identity["agent_id"]:
        _report_failure(envelope, identity["agent_id"], "ERR_NOT_RECIPIENT")
        raise PermissionError("ERR_NOT_RECIPIENT")

    plaintext_bytes = unseal_payload(payload["ciphertext"], identity["seal_private_key"])

    result = verify_sealed_content_hash(envelope, plaintext_bytes)
    if not result["ok"]:
        _report_failure(envelope, identity["agent_id"], result["error_code"])
        raise ValueError(result["error_code"])

    content = json.loads(plaintext_bytes.decode())
    _report_opened(envelope, identity["agent_id"])
    return content


def verify_and_open(envelope: dict, identity: dict, registry: dict = None) -> dict:
    """
    Convenience: verify then open (if SEALED). Content only returned on success.
    Returns {ok, content?, error_code?, detail?}.
    """
    if registry is None:
        registry = load_registry()

    result = verify(envelope, registry)
    if not result["ok"]:
        _report_failure(envelope, identity["agent_id"], result["error_code"])
        _report_verification_failed(envelope, identity["agent_id"], result["error_code"])
        return result

    _report_verified(envelope, identity["agent_id"])

    payload = envelope.get("payload", {})
    if payload.get("mode") == "SEALED":
        try:
            content = open_envelope(envelope, identity)
            return {"ok": True, "content": content}
        except (PermissionError, ValueError) as e:
            code = str(e)
            return {"ok": False, "error_code": code, "detail": str(e)}
    else:
        return {"ok": True, "content": payload.get("content")}


def _report_verified(envelope: dict, checked_by: str) -> None:
    try:
        requests.post(f"{RELAY_BASE}/verified", json={
            "envelope_id": envelope["header"]["envelope_id"],
            "envelope_hash": envelope.get("envelope_hash", ""),
            "checked_by": checked_by,
        }, timeout=5)
    except Exception:
        pass


def _report_verification_failed(envelope: dict, checked_by: str, error_code: str) -> None:
    try:
        requests.post(f"{RELAY_BASE}/verification_failed", json={
            "envelope_id": envelope["header"]["envelope_id"],
            "envelope_hash": envelope.get("envelope_hash", ""),
            "error_code": error_code,
            "checked_by": checked_by,
        }, timeout=5)
    except Exception:
        pass


def _report_failure(envelope: dict, checked_by: str, error_code: str) -> None:
    _report_verification_failed(envelope, checked_by, error_code)


def _report_opened(envelope: dict, agent_id: str) -> None:
    try:
        requests.post(f"{RELAY_BASE}/opened", json={
            "envelope_id": envelope["header"]["envelope_id"],
            "envelope_hash": envelope.get("envelope_hash", ""),
            "actor_id": agent_id,
        }, timeout=5)
    except Exception:
        pass
