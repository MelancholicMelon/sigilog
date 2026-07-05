# sigilog

**A protocol layer for multi-agent AI: verified identity, tamper-evident messages, and replayable audit trails.**

> An AI agent at your bank just approved a loan. Can you prove why?

Today's multi-agent systems exchange plain context — JSON blobs and API calls with no cryptographic guarantee of who sent them, whether they were altered in transit, or who's read them since. `sigilog` is the trust and provenance layer underneath that exchange: think **TLS + git for AI agents**, not another agent framework or memory store.

---

## What it guarantees

| Guarantee | Question it answers | Mechanism |
|---|---|---|
| **Authenticity** | Which agent actually produced this? | Ed25519 signature, verified against an identity registry |
| **Integrity** | Has it changed since it was signed? | Signed content hash; any mutation invalidates it |
| **Confidentiality** | Can only the right recipient read it? | Payloads can be sealed (encrypted) to a specific recipient |
| **Provenance** | How did this information move between agents? | Every envelope cites the hash of what it derived from — a signed, causal DAG |
| **Replayability** | Can we reconstruct the whole sequence later? | Every event lands in an append-only, hash-chained ledger |

`sigilog` doesn't decide whether an agent's output is *correct* — it guarantees you can always prove *who said it, whether it's intact, and how it got there.* Accountability, not omniscience.

---

## Why this, not TLS / JWT / a blockchain?

- **Not TLS** — TLS secures a channel between two endpoints. `sigilog` secures the *artifact itself* as it hops across many agents and organizations, long after any single connection has closed.
- **Not a blockchain** — no consensus, no tokens, no mining. Just a hash-chained log: cheap, fast, and sufficient for a single-operator or federated audit trail.
- **Not an agent framework** — `sigilog` doesn't orchestrate agents or store their memory. It's a thin protocol + SDK that any framework can sit on top of.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Observability Layer — live visualization + audit replay │
├─────────────────────────────────────────────────────────┤
│  Ledger Layer — append-only, hash-chained event log      │
├─────────────────────────────────────────────────────────┤
│  Protocol Layer — signed, optionally sealed envelopes     │
├─────────────────────────────────────────────────────────┤
│  Identity Layer — agent registry (agent_id ↔ public key) │
└─────────────────────────────────────────────────────────┘
        ▲                        ▲                    ▲
   ┌────┴─────┐            ┌─────┴────┐          ┌─────┴────┐
   │  Agent A │            │ Agent B  │          │ Agent C  │
   └──────────┘            └──────────┘          └──────────┘
```

A central relay routes envelopes and logs every event — but the relay is **untrusted**: it can't forge a signature, can't read a sealed payload, and can't rewrite history without breaking the hash chain. Trust lives in the cryptography, not the infrastructure.

---

## Demo scenario: a loan approval pipeline

Four scripted agents pass context down a chain — a realistic stand-in for any regulated, multi-party AI workflow (finance, healthcare, cross-org robotics):

```
intake-agent → risk-agent → compliance-agent → decision-agent
 (seals PII)    (assesses)     (checks policy)    (final call)
```

The live demo shows:
1. **Happy path** — the decision carries its full, verifiable ancestry back to the original application.
2. **Confidentiality** — the PII payload is sealed; even the relay's own logs show only ciphertext.
3. **Live tampering** — a "malicious relay" toggle mutates a message mid-flight; verification fails instantly and the bad data never reaches the decision.
4. **Historical tampering** — hand-edit an old ledger record; the auditor pinpoints exactly where the chain breaks.
5. **Replay** — scrub back through the entire incident and watch it re-verify itself.

---

## Repository layout

```
sigilog/
├── PLAN.md          # full design doc: architecture, security model, roadmap
├── contracts/        # frozen protocol contracts — the source of truth
│   ├── envelope.schema.md
│   ├── ledger.schema.md
│   ├── events.schema.md
│   ├── sdk.api.md
│   ├── transport.md
│   └── fixtures/      # golden test envelopes, sample ledgers, sample streams
├── protocol/          # identity, envelope signing/sealing, SDK, demo agents
├── infra/             # relay, hash-chained ledger, auditor, replay engine
├── ui/                # agent graph, ledger panel, provenance inspector, replay UI
├── integration/       # cross-component tests against contracts/fixtures
└── submission/        # hackathon deliverables (pitch, video script, writeups)
```

See [`PLAN.md`](./PLAN.md) for the full architecture, threat model, audit/provenance design, team workflow, and roadmap.

---

## Getting started

```bash
git clone https://github.com/<you>/sigilog.git
cd sigilog
# see contracts/transport.md for ports, endpoints, and runtime paths
```

Each of `protocol/`, `infra/`, and `ui/` runs independently against the schemas in `contracts/` — see `contracts/README.md` for the exact bring-up sequence.

---

## Status

Early-stage hackathon build. Protocol contracts are frozen; components are under active development. Not production-hardened — see `PLAN.md` §10 for known limitations (centralized registry, delivery isn't guaranteed, a compromised agent can still sign nonsense) and the roadmap for where this goes next.

## License

TBD.
