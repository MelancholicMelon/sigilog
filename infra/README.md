# infra/ — Member B (relay + ledger + auditor + replay)

The single service on `http://localhost:8080` (contracts/transport.md §2). Untrusted
transport: it routes signed envelopes and records every event into a hash-chained,
append-only ledger, but it never signs, and it cannot read sealed payloads.

## Run

```bash
npm install
npm start                 # relay + ledger + SSE + control API on :8080
npm run seed              # drive the loan scenario through a running relay (happy path)
npm run seed -- --tamper  # same, but the relay corrupts RISK_ASSESSMENT in flight
npm run audit             # standalone auditor over runtime/ledger.jsonl (exit 0 = CHAIN_OK)
npm test                  # deterministic core test (chain / tamper / break / replay)
npm run fixtures          # regenerate contracts/fixtures/sample_event_stream.jsonl
npm run fixtures:ledger   # regenerate sample_ledger.valid / .broken_chain
```

## Fixtures produced for the team (contracts/fixtures/, §13.3)

| File | For | Notes |
|---|---|---|
| `sample_event_stream.jsonl` | C's UI / mockfeed | 91 real events, every SSE kind, incl. `VERIFICATION_FAILED` + audit break |
| `sample_ledger.valid.jsonl` | C, integration | honest chain (chain-check fixture; no envelope store) |
| `sample_ledger.broken_chain.jsonl` | C, integration | seq **2** edited, `record_hash` left stale → `CHAIN_BROKEN_AT 2` |

## Layout

| Path | Role |
|---|---|
| `lib/canonical.js` | canonicalization + SHA-256 + hashes (THE interop rule — do not touch without a huddle) |
| `lib/bus.js` | SSE event bus (`emit` stamps `stream_seq`, fans out to `/events`) |
| `ledger/ledger.js` | hash-chained JSONL ledger + envelope store + read APIs |
| `relay/server.js` | Express app; all `:8080` endpoints |
| `relay/tamper.js` | the malicious in-flight mutation |
| `auditor/auditor.js` | standalone chain + Ed25519 signature re-verification |
| `replay/replay.js` | timed `replay_event` re-emission |
| `test/` | stand-in for A's SDK/agents until Checkpoint 1 (clearly marked) |

## Endpoints

`POST /send` · `GET /inbox/:id` · `POST /verified` · `POST /verification_failed` ·
`POST /opened` · `GET /events` (SSE) · `GET /ledger/records|/ledger/exists/:hash|/ledger/head` ·
`POST /relay/malicious` · `POST /audit/run` · `POST /replay` · `POST /scenario/start` ·
`GET /registry`

## Notes for integration (Checkpoint 1)

- **Envelope store** (`runtime/envelopes.jsonl`): B persists every `/send` envelope so the
  auditor can re-verify signatures — the ledger record only carries `envelope_hash`. This
  fills a contract gap; confirm with the team.
- **Lazy `REGISTERED`**: the relay records an agent the first time it sends (idempotent).
  If A prefers an explicit register call, that's a contracts huddle.
- **Auditor signature check** is independent (stdlib Ed25519 against the frozen sign-input),
  not a call into A's `verify`. If A's construction and B's diverge, valid envelopes fail —
  reconcile canonicalization first.
- **`test/agents.js` `seal()`/`open()`** is a reversible base64url stand-in, NOT real
  encryption. A's real sealing replaces it.
- **Latent contract risk**: `sdk.api.md §3` pins `score: 0.87` (a float) inside a signed
  payload; `envelope.schema.md §2.4` says integers only. `0.87` serializes identically in
  JS and Python, but flag any other floats.
