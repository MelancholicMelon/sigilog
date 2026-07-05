"""
Generates all golden fixtures for contracts/fixtures/.
Run: python protocol/generate_fixtures.py
Produces:
  contracts/fixtures/sample_registry.json
  contracts/fixtures/sample_keys.json          (public keys only — no private keys)
  contracts/fixtures/golden_envelope.valid.json
  contracts/fixtures/golden_envelope.forged.json
  contracts/fixtures/golden_envelope.tampered.json
  contracts/fixtures/sealed_envelope.sample.json
"""
import json
import os
import sys
import copy

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from protocol.identity.registry import load_registry, load_identity
from protocol.envelope.envelope import (
    build_plaintext_envelope,
    build_sealed_envelope,
    compute_envelope_hash,
)
from protocol.envelope.crypto import b64url_encode
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

FIXTURES_DIR = "contracts/fixtures"
os.makedirs(FIXTURES_DIR, exist_ok=True)


def write_fixture(name: str, data) -> None:
    path = os.path.join(FIXTURES_DIR, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  wrote {path}")


if __name__ == "__main__":
    print("Generating fixtures...")
    registry = load_registry()

    # sample_registry.json — public view (no private keys)
    write_fixture("sample_registry.json", registry)

    # sample_keys.json — public keys only for testing
    sample_keys = {
        a["agent_id"]: {"public_key": a["public_key"], "seal_public_key": a["seal_public_key"]}
        for a in registry["agents"]
    }
    write_fixture("sample_keys.json", sample_keys)

    # Load identities
    intake = load_identity("intake-agent")
    risk = load_identity("risk-agent")
    compliance = load_identity("compliance-agent")
    decision = load_identity("decision-agent")

    # golden_envelope.valid.json — intake → risk, PLAINTEXT (no parent)
    valid_env = build_plaintext_envelope(
        sender_id="intake-agent",
        recipient_ids=["risk-agent"],
        message_type="LOAN_APPLICATION",
        content={"amount": 3000000, "income": 5200000, "name": "Taro Yamada"},
        parent_hashes=[],
        hop_history=["intake-agent"],
        private_key_b64=intake["private_key"],
    )
    write_fixture("golden_envelope.valid.json", valid_env)
    valid_hash = valid_env["envelope_hash"]
    print(f"  valid envelope_hash: {valid_hash[:20]}...")

    # golden_envelope.forged.json — same content but signed with a different (fresh) key
    forged_priv = Ed25519PrivateKey.generate()
    forged_priv_b64 = b64url_encode(forged_priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))
    forged_env = build_plaintext_envelope(
        sender_id="intake-agent",    # claims to be intake-agent
        recipient_ids=["risk-agent"],
        message_type="LOAN_APPLICATION",
        content={"amount": 3000000, "income": 5200000, "name": "Taro Yamada"},
        parent_hashes=[],
        hop_history=["intake-agent"],
        private_key_b64=forged_priv_b64,    # but signed with wrong key
    )
    write_fixture("golden_envelope.forged.json", forged_env)

    # golden_envelope.tampered.json — valid envelope with payload mutated after signing
    tampered_env = copy.deepcopy(valid_env)
    tampered_env["payload"]["content"]["amount"] = 999999999  # mutated
    # signature is unchanged — verification should fail (ERR_HASH_MISMATCH)
    write_fixture("golden_envelope.tampered.json", tampered_env)

    # sealed_envelope.sample.json — intake → risk, SEALED with real PII
    sealed_env = build_sealed_envelope(
        sender_id="intake-agent",
        recipient_ids=["risk-agent"],
        message_type="LOAN_APPLICATION",
        content={"amount": 3000000, "income": 5200000, "name": "Taro Yamada"},
        parent_hashes=[],
        hop_history=["intake-agent"],
        private_key_b64=intake["private_key"],
        recipient_seal_public_key_b64=risk["seal_public_key"],
    )
    write_fixture("sealed_envelope.sample.json", sealed_env)
    print(f"  sealed envelope_hash: {sealed_env['envelope_hash'][:20]}...")

    print("\nDone. Fixtures in contracts/fixtures/")
