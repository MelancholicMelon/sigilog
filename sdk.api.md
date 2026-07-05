# contracts/sdk.api — Agent SDK Surface & Error Codes

Implemented by **A**. Called by A's demo agents and B (verify only). Error codes rendered verbatim by **C**. FROZEN after 0:30.

## 1. Functions (language-neutral signatures)

```
generate_identity(agent_id, metadata) -> {agent_id, public_key, private_key}
    # also appends the public half to the registry file (transport.md §3)

send(sender_identity, recipient_ids, message_type, content, parent_hashes=[], seal=false)
    -> envelope
    # builds, hashes, signs, (optionally seals), POSTs to relay /send
    # returns the full envelope incl. envelope_hash for use as a future parent

receive(identity) -> [envelope, ...]
    # polls or long-polls relay /inbox/<agent_id>; returns UNVERIFIED envelopes

verify(envelope, registry, ledger_client) -> {ok: true}
                                           | {ok: false, error_code, detail}
    # performs the 4-step check in envelope.schema.md §4
    # PURE function apart from the ledger-exists lookup — B may call it too

open(envelope, identity) -> {content}     # unseal; only valid for the recipient
    # reports OPENED to relay /opened so B can ledger it

verify_and_open(envelope, identity, ...) -> {ok, content?, error_code?}
    # convenience: what demo agents actually call; content is returned ONLY if ok
```

Hard rule: agent business logic may only ever see `content` that came out of a
successful `verify_and_open`. There is no bypass path in the SDK.

## 2. Canonical error codes (exhaustive; exact strings)

| Code | Meaning | Raised at step |
|---|---|---|
| `ERR_UNKNOWN_SENDER` | sender_id not in registry | verify step 1 |
| `ERR_SIG_INVALID` | signature does not verify against sender's public key | verify step 2 |
| `ERR_HASH_MISMATCH` | recomputed content_hash ≠ envelope.content_hash | verify step 3 |
| `ERR_PARENT_NOT_FOUND` | a parent_hash absent from ledger | verify step 4 |
| `ERR_NOT_RECIPIENT` | open() attempted by non-recipient of SEALED payload | open |
| `ERR_MALFORMED` | envelope fails schema/canonicalization parsing | pre-verify |

Notes:
- The in-flight-tamper demo surfaces as `ERR_SIG_INVALID` (relay mutated the
  payload, so the signed region no longer matches) — C's red ❌ shows this code.
- On any failure, the SDK reports it to relay `POST /verification_failed`
  with `{envelope_id, error_code, checked_by}` so B can ledger a
  `VERIFICATION_FAILED` record. A implements the report; B implements the endpoint.

## 3. Demo agents (A builds; exact behavior)

All four are scripted (no LLM calls). Triggered by B's `POST /scenario/start`
via A's runner (`transport.md` §5).

| Agent | On trigger/receive | Sends |
|---|---|---|
| `intake-agent` | scenario start | `LOAN_APPLICATION` (SEALED → risk-agent), parents `[]`; content includes fake PII: `{"name":"Taro Yamada","income":5200000,"amount":3000000}` |
| `risk-agent` | verified LOAN_APPLICATION | `RISK_ASSESSMENT` (PLAINTEXT → compliance-agent), content `{"risk":"HIGH","score":0.87}`, parent = app hash |
| `compliance-agent` | verified RISK_ASSESSMENT | `COMPLIANCE_CHECK` (PLAINTEXT → decision-agent), content `{"policy":"PASS_WITH_REVIEW"}`, parent = assessment hash |
| `decision-agent` | verified COMPLIANCE_CHECK | `DECISION` (PLAINTEXT → intake-agent), content `{"decision":"DENY","reason":"HIGH risk"}`, parents = [check hash, assessment hash] |

The malicious relay flips `"risk":"HIGH"` → `"LOW"` in flight; compliance-agent
then rejects with `ERR_SIG_INVALID` and the chain stops — that IS the demo.
