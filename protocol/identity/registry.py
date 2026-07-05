import json
import os

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

from protocol.envelope.crypto import b64url_encode, b64url_decode

REGISTRY_PATH = "runtime/registry.json"
KEYS_DIR = "runtime/keys"


def _load_registry() -> dict:
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH) as f:
            return json.load(f)
    return {"agents": []}


def _save_registry(registry: dict) -> None:
    os.makedirs(os.path.dirname(REGISTRY_PATH), exist_ok=True)
    with open(REGISTRY_PATH, "w") as f:
        json.dump(registry, f, indent=2)


def generate_identity(agent_id: str, metadata: dict) -> dict:
    """
    Generate Ed25519 (signing) + X25519 (sealing) keypairs for an agent.
    Writes public keys to registry, private keys to runtime/keys/<agent_id>.key.
    Returns {agent_id, public_key, seal_public_key, private_key, seal_private_key}.
    """
    sign_priv = Ed25519PrivateKey.generate()
    sign_pub = sign_priv.public_key()
    seal_priv = X25519PrivateKey.generate()
    seal_pub = seal_priv.public_key()

    sign_pub_b64 = b64url_encode(sign_pub.public_bytes(Encoding.Raw, PublicFormat.Raw))
    sign_priv_b64 = b64url_encode(sign_priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))
    seal_pub_b64 = b64url_encode(seal_pub.public_bytes(Encoding.Raw, PublicFormat.Raw))
    seal_priv_b64 = b64url_encode(seal_priv.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()))

    os.makedirs(KEYS_DIR, exist_ok=True)
    key_path = os.path.join(KEYS_DIR, f"{agent_id}.key")
    with open(key_path, "w") as f:
        json.dump({
            "agent_id": agent_id,
            "private_key": sign_priv_b64,
            "seal_private_key": seal_priv_b64,
        }, f)

    registry = _load_registry()
    registry["agents"] = [a for a in registry["agents"] if a["agent_id"] != agent_id]
    entry = {"agent_id": agent_id, "public_key": sign_pub_b64, "seal_public_key": seal_pub_b64}
    entry.update(metadata)
    registry["agents"].append(entry)
    _save_registry(registry)

    return {
        "agent_id": agent_id,
        "public_key": sign_pub_b64,
        "seal_public_key": seal_pub_b64,
        "private_key": sign_priv_b64,
        "seal_private_key": seal_priv_b64,
    }


def load_registry() -> dict:
    return _load_registry()


def get_agent(registry: dict, agent_id: str) -> dict:
    for a in registry.get("agents", []):
        if a["agent_id"] == agent_id:
            return a
    return None


def load_identity(agent_id: str) -> dict:
    """Load full identity (public + private keys) for an agent."""
    key_path = os.path.join(KEYS_DIR, f"{agent_id}.key")
    if not os.path.exists(key_path):
        raise FileNotFoundError(f"No key file for {agent_id}")
    with open(key_path) as f:
        keys = json.load(f)

    registry = _load_registry()
    agent = get_agent(registry, agent_id)
    if not agent:
        raise ValueError(f"Agent {agent_id} not found in registry")

    return {
        "agent_id": agent_id,
        "public_key": agent["public_key"],
        "seal_public_key": agent["seal_public_key"],
        "private_key": keys["private_key"],
        "seal_private_key": keys["seal_private_key"],
    }
