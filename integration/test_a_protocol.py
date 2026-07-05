"""
[A] Integration tests: verify sign/verify round-trip against golden fixtures.
These tests run without the relay (no parent-hash check = step 4 is skipped via mock).
"""
import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from protocol.sdk.verify import verify
from protocol.envelope.crypto import sha256_hex
from protocol.envelope.canon import canonical
from protocol.identity.registry import load_registry


def load_fixture(name):
    path = os.path.join("contracts/fixtures", name)
    with open(path) as f:
        return json.load(f)


def _no_ledger_check(envelope_hash):
    # Parent hashes are empty in the fixtures so this won't be called
    return True


class TestProtocolFixtures(unittest.TestCase):

    def setUp(self):
        self.registry = load_registry()

    @patch("protocol.sdk.verify._ledger_has_hash", return_value=True)
    def test_valid_envelope_verifies(self, _mock):
        env = load_fixture("golden_envelope.valid.json")
        result = verify(env, self.registry)
        self.assertTrue(result["ok"], f"Expected ok, got: {result}")

    @patch("protocol.sdk.verify._ledger_has_hash", return_value=True)
    def test_forged_envelope_fails_sig(self, _mock):
        env = load_fixture("golden_envelope.forged.json")
        result = verify(env, self.registry)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error_code"], "ERR_SIG_INVALID")

    @patch("protocol.sdk.verify._ledger_has_hash", return_value=True)
    def test_tampered_envelope_fails_hash(self, _mock):
        env = load_fixture("golden_envelope.tampered.json")
        result = verify(env, self.registry)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error_code"], "ERR_HASH_MISMATCH")

    @patch("protocol.sdk.verify._ledger_has_hash", return_value=True)
    def test_sealed_envelope_verifies_sig(self, _mock):
        env = load_fixture("sealed_envelope.sample.json")
        result = verify(env, self.registry)
        # Sig and parent check should pass; hash check skipped for SEALED (done post-unseal)
        self.assertTrue(result["ok"], f"Expected ok, got: {result}")

    def test_canonical_deterministic(self):
        obj = {"z": 1, "a": 2, "m": {"b": 3, "a": 4}}
        c1 = canonical(obj)
        c2 = canonical(obj)
        self.assertEqual(c1, c2)
        self.assertEqual(c1, '{"a":2,"m":{"a":4,"b":3},"z":1}')

    def test_envelope_hash_stable(self):
        env = load_fixture("golden_envelope.valid.json")
        from protocol.envelope.envelope import compute_envelope_hash
        # Remove envelope_hash and recompute
        env_copy = {k: v for k, v in env.items() if k != "envelope_hash"}
        recomputed = compute_envelope_hash(env_copy)
        self.assertEqual(recomputed, env["envelope_hash"])

    @patch("protocol.sdk.verify._ledger_has_hash", return_value=True)
    def test_sealed_unseal_round_trip(self, _mock):
        from protocol.envelope.crypto import unseal_payload
        from protocol.identity.registry import load_identity

        env = load_fixture("sealed_envelope.sample.json")
        risk = load_identity("risk-agent")
        plaintext_bytes = unseal_payload(env["payload"]["ciphertext"], risk["seal_private_key"])
        content = json.loads(plaintext_bytes.decode())
        self.assertEqual(content["name"], "Taro Yamada")
        self.assertEqual(content["amount"], 3000000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
