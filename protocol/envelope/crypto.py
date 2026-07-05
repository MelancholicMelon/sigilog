import hashlib
import os
import struct
import base64

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

from .canon import canonical


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    if pad != 4:
        s += '=' * pad
    return base64.urlsafe_b64decode(s)


def ed25519_sign(private_key_b64: str, message: bytes) -> str:
    priv_bytes = b64url_decode(private_key_b64)
    priv_key = Ed25519PrivateKey.from_private_bytes(priv_bytes)
    return b64url_encode(priv_key.sign(message))


def ed25519_verify(public_key_b64: str, message: bytes, signature_b64: str) -> bool:
    try:
        pub_bytes = b64url_decode(public_key_b64)
        pub_key = Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub_key.verify(b64url_decode(signature_b64), message)
        return True
    except Exception:
        return False


def _derive_key(shared_secret: bytes) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=b"AgentSeal v0.1",
    )
    return hkdf.derive(shared_secret)


def seal_payload(plaintext_bytes: bytes, recipient_seal_public_key_b64: str) -> dict:
    """Hybrid encrypt: ephemeral X25519 DH + AES-256-GCM."""
    ephemeral_priv = X25519PrivateKey.generate()
    ephemeral_pub = ephemeral_priv.public_key()

    rec_pub_bytes = b64url_decode(recipient_seal_public_key_b64)
    rec_pub = X25519PublicKey.from_public_bytes(rec_pub_bytes)

    shared_secret = ephemeral_priv.exchange(rec_pub)
    key = _derive_key(shared_secret)

    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, None)

    ephemeral_pub_bytes = ephemeral_pub.public_bytes(Encoding.Raw, PublicFormat.Raw)

    # Pack: ephemeral_pub(32) + nonce(12) + ciphertext
    blob = ephemeral_pub_bytes + nonce + ciphertext
    return b64url_encode(blob)


def unseal_payload(ciphertext_b64: str, recipient_seal_private_key_b64: str) -> bytes:
    """Reverse of seal_payload."""
    blob = b64url_decode(ciphertext_b64)
    ephemeral_pub_bytes = blob[:32]
    nonce = blob[32:44]
    ciphertext = blob[44:]

    rec_priv_bytes = b64url_decode(recipient_seal_private_key_b64)
    rec_priv = X25519PrivateKey.from_private_bytes(rec_priv_bytes)
    ephemeral_pub = X25519PublicKey.from_public_bytes(ephemeral_pub_bytes)

    shared_secret = rec_priv.exchange(ephemeral_pub)
    key = _derive_key(shared_secret)

    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)
