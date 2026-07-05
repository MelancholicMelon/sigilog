# contracts/events.schema — Relay→UI Live Event Stream

Emitted by **B** (and mimicked exactly by C's `mockfeed/` until 2:45). Consumed by **C**. FROZEN after 0:30.

## 1. Transport

Server-Sent Events: `GET http://localhost:8080/events`
Each SSE `data:` line is one JSON object:

```json
{ "stream_seq": 17, "kind": "<see §2>", "timestamp": "...", "data": { } }
```

`stream_seq` is a monotonically increasing integer per server run (lets C
detect gaps after reconnect).

## 2. Event kinds and their `data` payloads (exhaustive)

### `ledger_record`
Fired for EVERY ledger append. `data` = the full ledger record verbatim
(ledger.schema.md §1). This one event kind drives both the ledger panel and —
via `event_type` — the graph animations:
- `SENT` → animate envelope leaving sender node
- `DELIVERED` → animate arrival at recipient node
- `VERIFIED` → green ✅ badge on the envelope + recipient
- `VERIFICATION_FAILED` → red ❌ badge + rejection animation; show
  `data.detail.error_code` verbatim
- `OPENED` → lock-opening indicator on the envelope

### `envelope_meta`
Fired alongside the `SENT` record so the UI can render envelope contents
without a second fetch. `data`:

```json
{
  "envelope_id": "...", "envelope_hash": "...",
  "sender_id": "...", "recipient_ids": ["..."],
  "message_type": "RISK_ASSESSMENT",
  "payload_mode": "PLAINTEXT",
  "payload_preview": "risk=HIGH score=0.87",       // ≤80 chars; for SEALED: "🔒 <n> bytes ciphertext"
  "parent_hashes": ["..."]
}
```

`payload_preview` for SEALED envelopes MUST NOT contain plaintext — this is
what makes the confidentiality demo visible.

### `relay_status`
`data`: `{ "malicious_mode": true|false }` — fired on startup and on every toggle.

### `audit_progress`
`data`: `{ "checked": 120, "total": 240 }` — fired periodically during an audit run.

### `audit_result`
`data`: `{ "chain": "CHAIN_OK" | "CHAIN_BROKEN_AT", "broken_at_seq": 137 | null, "signatures_ok": 42, "signatures_failed": 1 }`

### `replay_event`
`data`: `{ "original": <a ledger_record event's full object>, "replay_speed": 4 }`
The UI renders these through the same pipeline as live events, in a visually
distinct "replay" style (e.g., sepia/labelled banner).

## 3. Control endpoints (C's buttons call these; B serves them)

| Button in UI | Call |
|---|---|
| Big red "CORRUPT NEXT MESSAGE" | `POST /relay/malicious {"enabled": true}` — relay mutates the NEXT envelope's payload in flight (e.g., flips a risk field), then auto-disables |
| "Run scenario" | `POST /scenario/start {}` — kicks the 4 demo agents through the loan flow (B proxies to A's agent runner; wiring agreed at Checkpoint 1) |
| "Run audit" | `POST /audit/run {}` |
| Replay scrubber | `POST /replay {...}` (ledger.schema.md §6) |

All control endpoints return `{"ok": true}` immediately; results arrive via the stream.

## 4. Sample stream (C's mockfeed must produce exactly this shape)

B commits `fixtures/sample_event_stream.jsonl` (≥20 lines, every kind ≥1,
including one `VERIFICATION_FAILED` and one `audit_result` with a break) by
2:15. C's mockfeed replicates this file's shapes from 0:45 using invented data.
