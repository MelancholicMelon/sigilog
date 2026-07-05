# contracts/transport — Ports, Paths, Names

Everyone reads this. FROZEN after 0:30.

## 1. Ports

| Component | Owner | Address |
|---|---|---|
| Relay + ledger + event stream + control API | B | `http://localhost:8080` |
| UI dev server | C | `http://localhost:3000` |
| Demo agents | A | in-process with A's runner (no port) — they talk HTTP to :8080 |

CORS: B allows origin `http://localhost:3000` on everything.

## 2. Full endpoint map on :8080 (B serves all of these)

| Method & path | Purpose | Spec |
|---|---|---|
| `POST /send` | agent submits an envelope | body = full envelope JSON; relay validates shape (NOT signature), ledgers SENT, routes |
| `GET /inbox/<agent_id>` | agent fetches deliveries | returns array of envelopes; ledgers DELIVERED on fetch |
| `POST /verification_failed` | SDK reports a failed verify | ledgers VERIFICATION_FAILED |
| `POST /verified` | SDK reports a passed verify | ledgers VERIFIED |
| `POST /opened` | SDK reports an unseal | ledgers OPENED |
| `GET /events` | SSE live stream | events.schema.md |
| `GET /ledger/records`, `/ledger/exists/<hash>`, `/ledger/head` | reads | ledger.schema.md §5 |
| `POST /relay/malicious` | corrupt toggle | events.schema.md §3 |
| `POST /audit/run` | run auditor | ledger.schema.md §4 |
| `POST /replay` | replay | ledger.schema.md §6 |
| `POST /scenario/start` | kick demo scenario | B forwards to A's runner hook — A and B agree the hook mechanism at Checkpoint 1 (simplest: B shells out to A's runner script) |
| `GET /registry` | serve the registry file | §3 below |

## 3. Registry

A single JSON file, generated/updated only by A's `generate_identity`:

Path: `runtime/registry.json` (repo root; `runtime/` is gitignored except a `.keep`)

```json
{
  "agents": [
    { "agent_id": "intake-agent", "public_key": "<base64url>", "role": "Loan intake", "org": "Demo Bank" }
  ]
}
```

Private keys live in `runtime/keys/<agent_id>.key` and are NEVER read by B or C.
B serves the registry read-only at `GET /registry`; C renders names/roles from it.

## 4. Runtime file paths

| Path | What | Owner |
|---|---|---|
| `runtime/registry.json` | public identities | A writes, all read |
| `runtime/keys/*.key` | private keys | A only |
| `runtime/ledger.jsonl` | THE ledger (the file you hand-edit in the historical-tamper demo) | B |

## 5. Pinned names (use these exact strings everywhere)

- Agent IDs: `intake-agent`, `risk-agent`, `compliance-agent`, `decision-agent`
- Message types: `LOAN_APPLICATION`, `RISK_ASSESSMENT`, `COMPLIANCE_CHECK`, `DECISION`
- Ledger event types: `REGISTERED`, `SENT`, `DELIVERED`, `VERIFIED`, `OPENED`, `VERIFICATION_FAILED`
- SSE kinds: `ledger_record`, `envelope_meta`, `relay_status`, `audit_progress`, `audit_result`, `replay_event`
- Error codes: `ERR_UNKNOWN_SENDER`, `ERR_SIG_INVALID`, `ERR_HASH_MISMATCH`, `ERR_PARENT_NOT_FOUND`, `ERR_NOT_RECIPIENT`, `ERR_MALFORMED`

## 6. Language note

Contracts are language-neutral (JSON + HTTP + SSE + SHA-256 + Ed25519 exist
everywhere). The three zones may even use different languages if the team
prefers — the seams are all HTTP/JSON/files. Decide per-zone languages in the
0:05–0:15 window and note them here:

- protocol/: ______
- infra/:    ______
- ui/:       ______
