# contracts/ledger.schema — Append-Only Hash-Chained Ledger

Implemented by **B**. Rendered by **C**. Queried by **A** (parent-existence check). FROZEN after 0:30.

## 1. Record structure (JSON, one per line in an append-only file — JSONL)

```json
{
  "sequence_number": 42,
  "record_id": "uuid-v4",
  "timestamp": "2026-07-05T09:30:01.000Z",
  "event_type": "SENT",
  "envelope_id": "uuid-of-envelope",
  "envelope_hash": "<sha256 hex>",
  "actor_id": "risk-agent",
  "detail": {},
  "prev_record_hash": "<record_hash of sequence_number 41>",
  "record_hash": "<see §3>"
}
```

- `actor_id`: the agent (or `"relay"` / `"auditor"`) that caused the event.
- `detail`: event-specific extras; for `VERIFICATION_FAILED` it MUST contain
  `{"error_code": "<code from sdk.api.md>", "checked_by": "<agent_id>"}`.
- Storage is a single JSONL file at the path pinned in `transport.md` §4 —
  chosen deliberately so the historical-tamper demo is "open file, edit a line."

## 2. Event types (exhaustive — exact strings, C renders these verbatim)

| event_type | Emitted when |
|---|---|
| `REGISTERED` | An agent identity is loaded/registered |
| `SENT` | Relay accepts an envelope from a sender |
| `DELIVERED` | Relay hands the envelope to a recipient |
| `VERIFIED` | Recipient's SDK reports successful verification |
| `OPENED` | Recipient unseals a SEALED payload |
| `VERIFICATION_FAILED` | Recipient's SDK reports failure (any error code) |

No other event types exist. Adding one = contracts huddle.

## 3. The chain rule

```
hash_input   = canonical( record_without_the_record_hash_field )
record_hash  = sha256_hex( utf8_bytes(hash_input) )
```

where `prev_record_hash` IS included in `hash_input`. Canonicalization rule is
identical to `envelope.schema.md` §2.

**Genesis record:** `sequence_number: 0`, `event_type: "REGISTERED"`,
`actor_id: "relay"`, `prev_record_hash: "0000000000000000000000000000000000000000000000000000000000000000"` (64 zeros).

## 4. Auditor contract (B implements; runnable standalone)

Given the ledger file + the registry, the auditor must:
1. Walk records in sequence order; recompute every `record_hash`; check every
   `prev_record_hash` linkage → report `CHAIN_OK` or `CHAIN_BROKEN_AT <seq>`
2. For every `SENT` record, re-verify the referenced envelope's signature via
   A's verify function → report per-envelope `SIG_OK` / `SIG_FAIL`
3. Exit with a machine-readable summary (JSON to stdout) AND emit
   `audit_progress` / `audit_result` events on the stream (`events.schema.md`)
   so C can animate it.

## 5. Read APIs (B serves; paths pinned in transport.md)

- `GET /ledger/records?from=<seq>&to=<seq>` → JSON array of records
- `GET /ledger/exists/<envelope_hash>` → `{"exists": true|false}`  ← A's SDK
  uses this for parent checks
- `GET /ledger/head` → latest record (for chain-head display)

## 6. Replay contract

`POST /replay {"from": 0, "to": <seq|null>, "speed": 4}` → B re-emits the
recorded events over the SSE stream wrapped as `replay_event` (see
events.schema.md) at `speed`× compressed timing. UI scrubber is just a client
of this endpoint.
