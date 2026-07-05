# contracts/envelope.schema — Signed Context Envelope

Implemented by **A**. Verified/stored by **B**. Rendered by **C**. FROZEN after 0:30.

## 1. Structure (JSON)

```json
{
  "header": {
    "envelope_id": "uuid-v4",
    "protocol_version": "0.1",
    "sender_id": "risk-agent",
    "recipient_ids": ["compliance-agent"],
    "timestamp": "2026-07-05T09:30:00.000Z",
    "message_type": "RISK_ASSESSMENT"
  },
  "provenance": {
    "parent_hashes": ["<envelope_hash of the envelope(s) this derives from>"],
    "hop_history": ["intake-agent", "risk-agent"]
  },
  "payload": {
    "mode": "PLAINTEXT",
    "content": { "any": "JSON value" }
  },
  "content_hash": "<sha256 hex, see §3>",
  "signature": "<base64url ed25519, see §4>"
}
```

Sealed variant — `payload` becomes:

```json
{
  "mode": "SEALED",
  "ciphertext": "<base64url>",
  "seal_info": { "recipient_id": "risk-agent", "scheme": "<A documents here>" }
}
```

Field rules:
- `parent_hashes`: `[]` for original content (root of a provenance chain).
- `hop_history`: informational only — NOT part of the security model (it is
  covered by the signature of the *current* sender only). Trust comes from
  walking `parent_hashes`, not from this list.
- `message_type`: one of the scenario types pinned in `transport.md`.

## 2. Canonicalization rule (THE rule — hashes break if anyone deviates)

`canonical(x)` = serialize JSON with:
1. Object keys sorted **alphabetically (byte order)** at every nesting level
2. No whitespace anywhere (separators `,` and `:` only)
3. UTF-8 encoding; no escaping of non-ASCII beyond what JSON requires
4. Numbers: integers only in all contract-defined fields (avoid floats in
   payloads you author; float formatting differs across languages)

Every member MUST use this exact rule wherever a hash or signature is computed
or checked. Most languages: `sort_keys=true` + compact separators.

## 3. content_hash

```
content_hash = sha256_hex( canonical(payload.content) )        # PLAINTEXT mode
content_hash = sha256_hex( plaintext_bytes_before_encryption ) # SEALED mode
```

In SEALED mode the hash is of the plaintext, so the recipient can verify
integrity after unsealing, while the relay/ledger stores only ciphertext + hash.

## 4. What exactly is signed

```
sign_input      = canonical( { "content_hash": ..., "header": {...}, "provenance": {...} } )
signature       = base64url( ed25519_sign( sender_private_key, utf8_bytes(sign_input) ) )
```

(Note: the three keys `content_hash`, `header`, `provenance` end up in that
alphabetical order automatically under the canonicalization rule.)

Verification (implemented by A in the SDK; B calls it, never re-implements):
1. Look up `sender_id` → public key in the registry (`transport.md` §3)
2. Rebuild `sign_input` from the received envelope; verify signature
3. Recompute `content_hash` from payload (after unsealing, if SEALED and you
   are the recipient); compare
4. For each `parent_hashes` entry: confirm it exists in the ledger
   (query endpoint in `transport.md`)

Failure at any step → the corresponding error code in `sdk.api.md`, and the
payload is NEVER handed to agent logic.

## 5. envelope_hash (how envelopes are referenced by others)

```
envelope_hash = sha256_hex( canonical(entire_envelope_including_signature) )
```

Used in: `parent_hashes`, ledger records, and UI provenance links.

## 6. Worked micro-example (for eyeballing, not for byte-exact testing)

A's `fixtures/golden_envelope.valid.json` is the byte-exact reference; this is
just orientation:

- intake-agent sends `LOAN_APPLICATION` (SEALED to risk-agent), parents `[]`
- risk-agent sends `RISK_ASSESSMENT` (PLAINTEXT), parents `[hash(loan app)]`
- compliance-agent sends `COMPLIANCE_CHECK`, parents `[hash(risk assessment)]`
- decision-agent sends `DECISION`, parents `[hash(compliance check), hash(risk assessment)]`
