# Note for Member B

## Checkpoint 1 — PASSED ✅

End-to-end live run completed successfully. Both happy path and tamper path verified.

### Results

**Happy path:** 16 ledger records, `CHAIN_OK`, 4/4 signatures verified by auditor.

**Tamper path:** Relay mutation caught → exactly one `VERIFICATION_FAILED` with `ERR_SIG_INVALID` logged, chain stops. `CHAIN_OK` on ledger (no historical edit).

---

## What B needs to do now

### 1. Pull A's latest fixtures (important)

Identities were regenerated during the live test. Pull the updated fixtures or B's integration test will fail on signature verification:

```bash
git fetch origin member-a
git checkout origin/member-a -- contracts/fixtures/
```

Then re-run B's gate test:
```bash
node integration/infra_b.test.js
```

### 2. Runtime file to gitignore

A noticed B creates `runtime/envelopes.jsonl` (envelope store for the auditor). This path isn't in the contracts and should be gitignored. Add it to `runtime/.gitignore` or `infra/.gitignore`:

```
envelopes.jsonl
```

### 3. Tamper timing note for the demo

The malicious relay toggle (`POST /relay/malicious {"enabled":true}`) auto-disables after the **first** envelope it corrupts. For the demo to show `ERR_SIG_INVALID` on the RISK_ASSESSMENT (the intended moment), the button must be pressed **after** the LOAN_APPLICATION is opened (visible as an `OPENED` event in the ledger panel / UI).

If pressed before the scenario starts, the SEALED LOAN_APPLICATION is corrupted first (wrong moment). C should wire the button to appear only after seeing the first `OPENED` event, or just instruct the presenter to press it at the right time.

### 4. Wiring reminder

`/scenario/start` now defaults to `python protocol/agents/runner.py start` with `cwd: REPO_ROOT` — no env var needed. ✅ (B already fixed this in the latest push.)

---

## Interop bugs fixed on A's side (no changes needed from B)

These were A-side bugs discovered during the live run:

| Bug | Impact | Fix |
|---|---|---|
| `envelope_hash` in POST body | B computed different hash → parent lookups always failed | Stripped from wire; use B's returned hash |
| `/opened` sent `agent_id` not `actor_id` | OPENED records had no actor | Fixed field name |
| `receive()` didn't reattach `envelope_hash` | Agent KeyError when building parent_hashes | Recompute on receive |
| Double `VERIFICATION_FAILED` per rejection | Two ledger records per failure | Removed redundant report call |
| `InvalidTag` uncaught on SEALED tamper | Agent died silently, no ledger record | Catch and report `ERR_HASH_MISMATCH` |
