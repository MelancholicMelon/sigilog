# Note for Member C

## Checkpoint 1 — PASSED ✅

The real A+B pipeline is working. You can swap your mockfeed for the real SSE stream now.

---

## How to connect to the real stream

1. Pull B's branch and A's branch:

```bash
git fetch origin
git checkout origin/member-b -- infra/
git checkout origin/member-a -- contracts/fixtures/ protocol/
```

2. Generate agent identities (A's step):

```bash
python protocol/setup_identities.py
python protocol/generate_fixtures.py
```

3. Start B's relay:

```bash
cd infra && npm install
node relay/server.js
# Relay listens on http://localhost:8080
```

4. Connect your UI to `GET http://localhost:8080/events` (SSE stream).

5. Kick the scenario: `POST http://localhost:8080/scenario/start`

---

## SSE event shapes (what you'll actually receive)

All events match `contracts/events.schema.md` exactly. Here's what the live run produced:

### Happy path sequence (16 ledger records)
```
REGISTERED  actor=relay          (genesis)
REGISTERED  actor=intake-agent
SENT        actor=intake-agent   message_type=LOAN_APPLICATION  payload_mode=SEALED
DELIVERED   actor=risk-agent
VERIFIED    actor=risk-agent
OPENED      actor=risk-agent     ← confidentiality demo: only risk-agent can open
REGISTERED  actor=risk-agent
SENT        actor=risk-agent     message_type=RISK_ASSESSMENT   payload_mode=PLAINTEXT
DELIVERED   actor=compliance-agent
VERIFIED    actor=compliance-agent
REGISTERED  actor=compliance-agent
SENT        actor=compliance-agent  message_type=COMPLIANCE_CHECK
DELIVERED   actor=decision-agent
VERIFIED    actor=decision-agent
REGISTERED  actor=decision-agent
SENT        actor=decision-agent    message_type=DECISION
```

### Tamper path (14 records — chain stops)
Same as above through seq 11 (SENT by compliance-agent), then:
```
DELIVERED          actor=decision-agent
VERIFICATION_FAILED actor=decision-agent  error_code=ERR_SIG_INVALID  ← the red ❌ moment
```

---

## Control endpoints your buttons call

| UI element | Call |
|---|---|
| "Run scenario" button | `POST http://localhost:8080/scenario/start {}` |
| "CORRUPT NEXT MESSAGE" button | `POST http://localhost:8080/relay/malicious {"enabled":true}` |
| "Run audit" button | `POST http://localhost:8080/audit/run {}` |
| Replay scrubber | `POST http://localhost:8080/replay {"from":0,"to":null,"speed":4}` |

**Tamper button timing:** press it **after** you see the `OPENED` event for `LOAN_APPLICATION` in the ledger panel. That's when the next message (RISK_ASSESSMENT or COMPLIANCE_CHECK) will be corrupted. If pressed before the scenario, the SEALED envelope is corrupted instead (wrong moment for the demo story).

---

## Registry endpoint (for rendering agent names/roles)

`GET http://localhost:8080/registry` returns:

```json
{
  "agents": [
    { "agent_id": "intake-agent",     "public_key": "...", "seal_public_key": "...", "role": "Loan intake",      "org": "Demo Bank" },
    { "agent_id": "risk-agent",       "public_key": "...", "seal_public_key": "...", "role": "Risk assessment",  "org": "Demo Bank" },
    { "agent_id": "compliance-agent", "public_key": "...", "seal_public_key": "...", "role": "Compliance check", "org": "Demo Bank" },
    { "agent_id": "decision-agent",   "public_key": "...", "seal_public_key": "...", "role": "Loan decision",    "org": "Demo Bank" }
  ]
}
```

Use `role` for display labels in the agent graph nodes. Note: `seal_public_key` is for encryption (X25519) — only A's SDK uses it; C can ignore it.

---

## Mockfeed deletion reminder

Per the plan (§13.1): delete or disable `ui/mockfeed/` at Checkpoint 2 (4:15) so the demo can never accidentally show fake data. Do this as the last step before feature freeze.

---

## Historical tamper demo (for the auditor animation)

After a scenario run, the ledger file is at `runtime/ledger.jsonl`. For the historical-tamper demo:

1. Run a scenario (populates the ledger)
2. Open `runtime/ledger.jsonl` in a text editor — edit any record's field (e.g. change a `risk` value in a `detail` field)
3. Call `POST http://localhost:8080/audit/run {}`
4. Watch the SSE stream — you'll get `audit_progress` events then an `audit_result` with `"chain":"CHAIN_BROKEN_AT"` and the exact sequence number

This is the second tamper demo moment. The `broken_at_seq` number should be highlighted in the ledger panel.
