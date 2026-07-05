# SigiLog — Member A Handoff

> Written for the next context window. Start here before touching anything.

---

## What this project is

**SigiLog** — a trust and provenance layer for multi-agent AI systems, demoed as a loan-approval pipeline. Four Python agents (`intake → risk → compliance → decision`) pass cryptographically signed, hash-chained envelopes through a relay. A live UI shows the provenance graph, ledger, and a business-facing Case Oversight panel.

**Team:** 3 members, each with their own branch (`member-a`, `member-b`, `member-c`).

- **A (you):** `protocol/` — Python crypto SDK, agents, identity
- **B:** `ui/infra/` — Node.js relay, ledger, auditor, SSE stream
- **C:** `ui/src/` — React 19 + TypeScript + Tailwind UI

**GitHub:** `https://github.com/MelancholicMelon/sigilog.git`

---

## Current status: Checkpoint 1 PASSED ✅

End-to-end live run complete. Happy path (16 ledger records, CHAIN_OK, 4/4 sigs) and tamper path (VERIFICATION_FAILED ERR_SIG_INVALID, chain stops) both verified.

---

## How to start everything

```bash
./launch.sh
```

Three tmux panes: relay (top), UI dev server (middle), scenario shell (bottom).
Then open `http://localhost:3000/?feed=real`.

---

## Key file map

| Path | What |
|---|---|
| `protocol/envelope/canon.py` | `canonical(obj)` — must match B's JS `JSON.stringify(sortValue(v))` |
| `protocol/envelope/crypto.py` | Ed25519 sign/verify + X25519-HKDF-SHA256-AES-256-GCM seal/unseal |
| `protocol/envelope/envelope.py` | `build_plaintext_envelope`, `build_sealed_envelope`, `compute_envelope_hash` |
| `protocol/identity/registry.py` | Agent identity mgmt; public keys in `runtime/registry.json` |
| `protocol/sdk/verify.py` | 4-step verify: sender known → sig valid → content_hash → parent_hashes in ledger |
| `protocol/sdk/sdk.py` | `send`, `receive`, `verify_and_open` — the public API agents use |
| `protocol/agents/runner.py` | Orchestrates all 4 agents; B shells out to this via `/scenario/start` |
| `protocol/setup_identities.py` | Generates Ed25519+X25519 keypairs for all agents |
| `protocol/generate_fixtures.py` | Re-generates `contracts/fixtures/` — **run after setup_identities.py** |
| `runtime/registry.json` | Public keys (committed) |
| `runtime/keys/<id>.key` | Private keys (gitignored, never share) |
| `runtime/ledger.jsonl` | Hash-chained ledger (gitignored, created at runtime) |
| `ui/infra/relay/server.js` | B's relay — `:8080`; SSE at `/events`; `/scenario/start` shells out to runner.py |
| `ui/src/App.tsx` | Layout: graph+inspector left, tabbed Oversight/Ledger right |
| `ui/src/components/Oversight.tsx` | **Added by A** — business case dashboard |
| `ui/src/components/Graph.tsx` | Agent graph; nodes show `name` + `role` from registry |
| `ui/src/store.ts` | `applyEvent()` pipeline, `ancestryOf()` provenance DAG |
| `contracts/fixtures/` | Golden fixtures for cross-member interop testing |
| `integration/test_a_protocol.py` | 8 unit tests — all passing |

---

## Critical invariants

### Envelope hash (the big one)
`envelope_hash = sha256(canonical({content_hash, header, payload, provenance, signature}))` — exactly 5 fields, **never** includes `envelope_hash` itself. On the wire, `envelope_hash` is stripped before `POST /send`; B's relay computes the authoritative hash from the 5-field body and returns it. A's SDK uses B's returned hash. This was Bug 1 — the root cause of all `ERR_PARENT_NOT_FOUND` failures.

### Canonical JSON
`json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False)` in Python. Must match B's JS `JSON.stringify(sortValue(value))` (recursive key sort). Confirmed identical by auditor (4/4 sig verify).

### Sign input
`canonical({"content_hash": ..., "header": ..., "provenance": ...})` — 3 fields only, no `payload`.

### Sealed envelopes
`seal_payload`: ephemeral X25519 DH → HKDF-SHA256(32-byte key) → AES-256-GCM. Wire blob = ephemeral_pub(32) + nonce(12) + ciphertext. Only the intended recipient can unseal. If `InvalidTag` is thrown on unseal, it means ciphertext was tampered — catch it and report `ERR_HASH_MISMATCH`.

### receive() must reattach envelope_hash
B strips it from stored envelopes. `sdk.receive()` recomputes via `compute_envelope_hash(env)` on each returned envelope. Required for agents to build `parent_hashes`.

### _report_opened uses `actor_id` not `agent_id`
B's `/opened` endpoint reads `actor_id`. Using `agent_id` silently fails (undefined actor in ledger).

---

## Bugs already fixed (don't re-introduce)

| Bug | Fix location |
|---|---|
| `envelope_hash` in POST body → B hash differs → ERR_PARENT_NOT_FOUND | `sdk.py send()`: strip before wire, use B's returned hash |
| `/opened` sent `agent_id` key, B reads `actor_id` | `sdk.py _report_opened()`: field renamed |
| `receive()` didn't reattach `envelope_hash` | `sdk.py receive()`: compute_envelope_hash on each env |
| Double VERIFICATION_FAILED per rejection | `sdk.py verify_and_open()`: removed redundant `_report_failure` call |
| `InvalidTag` uncaught on sealed tamper → agent died silently | `sdk.py open_envelope()`: catch Exception → ERR_HASH_MISMATCH |

---

## Demo flow (for rehearsal)

1. Open `http://localhost:3000/?feed=real` — Case Oversight tab is default
2. Click **▶ Run scenario** — watch 16 ledger records populate, DECISION card appears
3. Run scenario again, but **after seeing the OPENED event**, click **CORRUPT NEXT MSG**
4. Watch VERIFICATION_FAILED (red node on graph), decision card does NOT appear
5. Edit `runtime/ledger.jsonl` to change a value → **Run audit** → CHAIN_BROKEN_AT

---

## What C needs to pull

C's UI was updated by A while C was low on tokens. C should:
```bash
git fetch origin
git checkout origin/member-a -- ui/src/App.tsx ui/src/components/Graph.tsx ui/src/components/Oversight.tsx ui/index.html
```
Full instructions in `NOTE_FOR_MEMBER_C.md`.

---

## What's left

- [ ] Demo rehearsal per §7 of PLAN.md
- [ ] Disable/delete mockfeed before Checkpoint 2 (feature freeze)
- [ ] Submission deliverables: problem statement, product/tech/business writeup, ≤90s demo video, market perspective
- [ ] Update `NOTE_FOR_MEMBER_B.md` if fixtures change again (re-run `generate_fixtures.py`)

---

## Relay endpoints (quick ref)

| Method | Path | What |
|---|---|---|
| GET | `/events` | SSE stream |
| POST | `/scenario/start` | Run loan pipeline |
| POST | `/relay/malicious {"enabled":true}` | Corrupt next envelope |
| POST | `/audit/run` | Hash-chain audit |
| POST | `/replay {"from":0,"to":null,"speed":4}` | Replay ledger |
| GET | `/registry` | Agent public keys + role + org |
| GET | `/inbox/<agent_id>` | Agent's unread envelopes |
| POST | `/send` | Ingest signed envelope |
| POST | `/verified` | Mark envelope verified |
| POST | `/opened` | Mark envelope opened (field: `actor_id`) |
| POST | `/verification_failed` | Log rejection |
