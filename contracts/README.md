# Phase 0 — Contracts Kickoff (0:00–0:30) — ALL THREE MEMBERS

This directory IS Phase 0. The design decisions that §13.2 of PLAN.md says must be
made in the first 30 minutes have been **pre-made and written down here** so the
team spends Phase 0 *ratifying and wiring*, not debating.

## What's in this directory

| File | Contents | Primary consumers |
|---|---|---|
| `envelope.schema.md` | Envelope structure, canonical serialization, hashing, signing | A (implements), B (verifies/stores), C (displays) |
| `ledger.schema.md` | Ledger record structure, hash chain rule, genesis record | B (implements), C (renders), A (reads for parent checks) |
| `events.schema.md` | Relay→UI event stream: endpoint, all event types, one sample each, corrupt-toggle API | B (emits), C (consumes) |
| `sdk.api.md` | SDK function signatures + canonical error codes | A (implements), C (displays error codes verbatim) |
| `transport.md` | Ports, endpoints, runtime file paths, agent IDs, scenario message types | everyone |
| `fixtures/` | Golden artifacts, deposited per the §13.3 schedule (empty at start except placeholders) | everyone |

## Pinned defaults (the "one decision" rules)

To make three parallel sessions interoperate, these are **pinned**. They are
deliberately the most universally-supported options in every mainstream language:

- **Wire format:** JSON (UTF-8)
- **Canonicalization:** JSON with keys sorted alphabetically at every nesting level,
  no whitespace, UTF-8 — see `envelope.schema.md` §2 for the exact rule
- **Hash:** SHA-256, rendered as lowercase hex
- **Signatures:** Ed25519, rendered as base64url (no padding)
- **Transport:** HTTP for requests, Server-Sent Events (SSE) for the live event stream
- **Timestamps:** ISO 8601 UTC with milliseconds, e.g. `2026-07-05T09:30:00.000Z`
- **IDs:** UUIDv4 for `envelope_id` and `record_id`

**Swap clause:** any default may be swapped in the first 10 minutes ONLY, by
unanimous agreement, and the change must be edited into this directory before
anyone writes code. After minute 10, pinned means pinned.

## The 30-minute agenda

| Time | Everyone does |
|---|---|
| 0:00–0:05 | All three read this README. Say out loud: your member letter and your zone. |
| 0:05–0:15 | Each member reads the two contract files they *consume* (per the table above), not just the one they implement. Raise any objection NOW — invoke the swap clause or forever hold your peace. |
| 0:15–0:20 | Create the repo: commit `PLAN.md` + this `contracts/` directory to `main`. Everyone clones/branches (`member-a`, `member-b`, `member-c`). |
| 0:20–0:25 | Smoke-test the seams: A generates one keypair and commits `fixtures/sample_registry.json`; B starts an empty HTTP server on the pinned port and serves a hardcoded SSE event; C confirms they can receive it (or notes the mockfeed fallback). |
| 0:25–0:30 | Each member re-reads ONLY their own brief in PLAN.md §13.4, states their first deliverable and its deadline out loud, and starts. |

## Definition of Done for Phase 0 (checklist)

- [ ] Repo exists on `main` with PLAN.md + contracts/; all three branches created
- [ ] All three members have read the contracts they consume
- [ ] Any swaps decided and edited in (or none)
- [ ] `fixtures/sample_registry.json` committed by A (even with just 1 test key)
- [ ] B's server answers on the pinned port (even with a stub event)
- [ ] Everyone can state, from memory, the five event type strings and the three
      SDK error codes they'll touch first

## Standing rules (repeated from PLAN.md §13 because they matter)

1. **Zone rule:** edit only your own directory. Cross-zone need = ask the owner.
2. **Freeze rule:** after 0:30, changing anything in `contracts/` requires all
   three present, ≤60 seconds, announced immediately.
3. **Fixture rule:** never modify a fixture someone already consumes; add `_v2`.
4. **Escalation rule:** stuck >15 minutes → say so out loud.
