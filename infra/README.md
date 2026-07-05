# infra/ — relay + ledger + auditor + replay

The single service on `http://localhost:8080` (contracts/transport.md §2). Untrusted
transport: it routes signed envelopes and records every event into a hash-chained,
append-only ledger, but it never signs, and it cannot read sealed payloads.

## Run

```bash
npm install
npm start                 # relay + ledger + SSE + control API on :8080
npm run audit             # standalone auditor over runtime/ledger.jsonl (exit 0 = CHAIN_OK)
```

## Layout

| Path | Role |
|---|---|
| `lib/canonical.js` | canonicalization + SHA-256 + hashes (THE interop rule — matches protocol/envelope/canon.py byte-for-byte) |
| `lib/bus.js` | SSE event bus (`emit` stamps `stream_seq`, fans out to `/events`) |
| `ledger/ledger.js` | hash-chained JSONL ledger + envelope store + read APIs |
| `relay/server.js` | Express app; all `:8080` endpoints |
| `relay/tamper.js` | the malicious in-flight mutation |
| `auditor/auditor.js` | standalone chain + Ed25519 signature re-verification |
| `replay/replay.js` | timed `replay_event` re-emission |

## Endpoints

`POST /send` · `GET /inbox/:id` · `POST /verified` · `POST /verification_failed` ·
`POST /opened` · `GET /events` (SSE) · `GET /ledger/records|/ledger/exists/:hash|/ledger/head` ·
`POST /relay/malicious` · `POST /audit/run` · `POST /replay` · `POST /scenario/start` ·
`GET /registry`

## Integration notes

- **Scenario runner**: `POST /scenario/start` runs the agent runner from the repo
  root. Default command is `python protocol/agents/runner.py start`; override with the
  `AGENT_RUNNER_CMD` env var. cwd is always the repo root regardless of where the relay
  was launched.
- **Envelope store** (`runtime/envelopes.jsonl`): the relay persists every `/send` envelope
  so the auditor can re-verify signatures — the ledger record only carries `envelope_hash`.
- **Lazy `REGISTERED`**: the relay records an agent the first time it sends (idempotent).
- **Auditor signature check** is independent (its own Ed25519 verification against the
  frozen sign-input), not a call into the Python SDK's `verify` — a genuinely third-party
  audit.
