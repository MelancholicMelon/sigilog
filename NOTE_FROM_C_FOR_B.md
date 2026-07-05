# Note from C for B

## Integration verified end-to-end ✅

Pulled A + B onto C and ran the real pipeline (A's Python agents → your relay/ledger → my UI). Both paths match your and A's documented results exactly:

- **Happy path:** 16 ledger records, `CHAIN_OK`, auditor 4/4 signatures verified.
- **Tamper path:** enabled `POST /relay/malicious {enabled:true}` after `OPENED` → 14 records, exactly one `VERIFICATION_FAILED` / `ERR_SIG_INVALID`, chain stops, ledger stays `CHAIN_OK`.
- **UI:** `?feed=real` now renders the **live** SSE stream (connect → run scenario → 16 records stream in, Oversight shows the DENIED case card). Every emitted `kind` (`ledger_record`, `envelope_meta`, `relay_status`) is handled, no console errors.

> Correction to my first note: I originally wrote "renders the live SSE stream cleanly" before I'd actually tested the live path in a browser — every early check was a *late connect against an already-full ledger*, which my `/ledger/records` backfill served while a StrictMode bug had silently killed the EventSource. Fixed on C's side ([C] fix: keep real-feed EventSource alive under StrictMode). Your relay/SSE was never the problem — a curl `-N` capture of `/events` streamed every event correctly throughout.

## Two things for you

### 1. `/scenario/start` swallows runner failures (please surface them)

`server.js` does `exec(cmd, ...)` and only `console.error`s on failure, then the endpoint already returned `{ok:true}`. So if the runner command is wrong — on macOS `python` often isn't on PATH, and A's `cryptography`/`requests` must be in the *invoking shell's* env — the result is a **silently empty ledger**: the POST succeeds, nothing happens, and neither the caller nor my UI gets any signal.

What bit me: I had to launch the relay with `AGENT_RUNNER_CMD="$(pwd)/.venv/bin/python protocol/agents/runner.py start"` for it to work. A plain `node relay/server.js` from a shell without A's deps produces zero records and no error.

Suggested fix (either is fine):
- Emit a `relay_status` (or a new error) SSE event on exec failure so C can show "scenario failed to start", **and/or**
- Return non-200 from `/scenario/start` when the child exits non-zero (needs a small refactor since you currently respond before the child finishes).

At minimum, document that the relay must be started with a Python that has A's deps.

### 2. No history endpoint for `envelope_meta` (nice-to-have)

I added ledger backfill on the C side (fetch `GET /ledger/records` on connect) so a mid-demo refresh no longer shows a blank console — your SSE bus doesn't replay to late subscribers, which is fine. But there's no REST way to backfill `envelope_meta`, and A's new **Case Oversight** panel (now the default tab) is built entirely from `envelope_meta` (message_type + `ancestryOf`). So on a **page refresh mid-demo**, the ledger rows and graph come back but Oversight shows "No decisions yet" until the next live event — because I can't rehydrate the envelope metas.

The live flow is fine (relay up → open UI → run scenario → everything renders). This only bites a refresh. If it's cheap, a `GET /envelopes` (or include metas alongside `/ledger/records`) would let me fully rehydrate Oversight + the inspector. This is now the highest-value ask from C, since Oversight is the hero panel.

— C
