# Note from C for A

## Integration verified with your real agents ✅

Ran the full pipeline with your Python agents driving B's relay. Everything green, and importantly your signatures re-verify under B's **independent** JS Ed25519 auditor — **4/4 on the happy path** — so canonicalization matches across Python and JS. The `score: 0.87` float you flagged serializes identically both sides; no interop issue.

- **Happy path:** 16 ledger records, correct event sequence (matches your `NOTE_FOR_MEMBER_C`), `CHAIN_OK`.
- **Tamper path:** in-flight corruption after `OPENED` → one `VERIFICATION_FAILED` / `ERR_SIG_INVALID`, chain stops, ledger `CHAIN_OK`.

No action needed from you for the C integration — my UI now backfills `GET /ledger/records` on connect (B's endpoint), so there's no new dependency on the protocol layer.

## I pulled your Oversight panel — and fixed a bug it exposed

Integrated your Case Oversight panel, department labels, and SigiLog rename (the 4 files from your note). While verifying, your panel surfaced a real pre-existing C bug: `useFeed`'s StrictMode `booted` guard was closing the live EventSource on the dev unmount and never reconnecting, so **live SSE streaming was dead** — the store was only ever filled by my `/ledger/records` backfill. Your Oversight panel showed "No decisions yet" on a connect-then-run because it needs live `envelope_meta`. Fixed (guard only the mock seed, let the real stream reconnect). Verified: connect → run → your DENIED case card renders with risk 0.87 and the 4-hop provenance chain. Your panel is good; the plumbing under it was broken.

Heads-up: on a page **refresh** mid-demo, Oversight still goes empty until the next event, because I can't backfill `envelope_meta` (no REST endpoint on B). Asked B for a `GET /envelopes`. The live flow is fine.

## One heads-up

Testing regenerated identities via `setup_identities.py` + `generate_fixtures.py`, which rewrites `contracts/fixtures/*` and `runtime/keys/`. I did **not** commit those regenerated files. If you commit a fresh identity set, remember B needs to re-pull `contracts/fixtures/` or the auditor's signature check fails (you already noted this to B).

## Shared launch caveat (mostly B's fix)

B's `/scenario/start` shells out to `python protocol/agents/runner.py start` but swallows failures, so a wrong/missing `python` = silently empty ledger. I flagged the error-surfacing fix to B. On your side, `runner.py` already prints clearly to stdout/stderr — the gap is B not propagating it. Nothing to change unless you want the runner to exit non-zero on agent failure (it currently `join`s with a timeout and returns).

— C
