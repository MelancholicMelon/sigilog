import json
import uuid
from datetime import datetime, timezone

from .canon import canonical
from .crypto import sha256_hex, b64url_encode, ed25519_sign, seal_payload


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime('%Y-%m-%dT%H:%M:%S.') + f"{now.microsecond // 1000:03d}Z"


def compute_content_hash_plaintext(content: dict) -> str:
    return sha256_hex(canonical(content).encode())


def compute_envelope_hash(envelope: dict) -> str:
    """Hash of the canonical full envelope (header, provenance, payload, content_hash, signature)."""
    # Only these 5 fields — exclude envelope_hash itself if present
    core = {
        "content_hash": envelope["content_hash"],
        "header": envelope["header"],
        "payload": envelope["payload"],
        "provenance": envelope["provenance"],
        "signature": envelope["signature"],
    }
    return sha256_hex(canonical(core).encode())


def build_sign_input(header: dict, provenance: dict, content_hash: str) -> str:
    return canonical({"content_hash": content_hash, "header": header, "provenance": provenance})


def build_plaintext_envelope(
    sender_id: str,
    recipient_ids: list,
    message_type: str,
    content: dict,
    parent_hashes: list,
    hop_history: list,
    private_key_b64: str,
) -> dict:
    content_hash = compute_content_hash_plaintext(content)

    header = {
        "envelope_id": str(uuid.uuid4()),
        "message_type": message_type,
        "protocol_version": "0.1",
        "recipient_ids": recipient_ids,
        "sender_id": sender_id,
        "timestamp": _now_iso(),
    }
    provenance = {
        "hop_history": hop_history,
        "parent_hashes": parent_hashes,
    }
    payload = {"content": content, "mode": "PLAINTEXT"}

    sign_input = build_sign_input(header, provenance, content_hash)
    signature = ed25519_sign(private_key_b64, sign_input.encode())

    envelope = {
        "content_hash": content_hash,
        "header": header,
        "payload": payload,
        "provenance": provenance,
        "signature": signature,
    }
    envelope["envelope_hash"] = compute_envelope_hash(envelope)
    return envelope


def build_sealed_envelope(
    sender_id: str,
    recipient_ids: list,
    message_type: str,
    content: dict,
    parent_hashes: list,
    hop_history: list,
    private_key_b64: str,
    recipient_seal_public_key_b64: str,
) -> dict:
    plaintext_bytes = canonical(content).encode()
    content_hash = sha256_hex(plaintext_bytes)
    ciphertext_b64 = seal_payload(plaintext_bytes, recipient_seal_public_key_b64)

    header = {
        "envelope_id": str(uuid.uuid4()),
        "message_type": message_type,
        "protocol_version": "0.1",
        "recipient_ids": recipient_ids,
        "sender_id": sender_id,
        "timestamp": _now_iso(),
    }
    provenance = {
        "hop_history": hop_history,
        "parent_hashes": parent_hashes,
    }
    payload = {
        "ciphertext": ciphertext_b64,
        "mode": "SEALED",
        "seal_info": {
            "recipient_id": recipient_ids[0],
            "scheme": "X25519-HKDF-SHA256-AES-256-GCM",
        },
    }

    sign_input = build_sign_input(header, provenance, content_hash)
    signature = ed25519_sign(private_key_b64, sign_input.encode())

    envelope = {
        "content_hash": content_hash,
        "header": header,
        "payload": payload,
        "provenance": provenance,
        "signature": signature,
    }
    envelope["envelope_hash"] = compute_envelope_hash(envelope)
    return envelope
