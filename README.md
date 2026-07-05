# sigilog

**A protocol layer for multi-agent AI: verified identity, tamper-evident messages, and replayable audit trails.**

*An extremely smart multi-agent AI system just made a critical decision. Can you prove exactly how it got there?*
> *A regulator calls. Three months ago, your bank's AI system denied a loan. The applicant is disputing it, and the regulator wants to know exactly what happened.*
>
> Your intake agent pulled the application. A risk agent scored it. A compliance agent checked it against policy. A decision agent denied it. All of this happened in nine seconds, across four different AI services, and the only record is a pile of logs that a competent engineer could have edited last Tuesday.
>
> Was the risk score accurate when it was computed? Did compliance actually see the same data that risk produced, or something altered in transit? Could someone — a bug, a bad actor, a misconfigured retry — have swapped a `HIGH` for a `LOW` between two agents nobody was watching? You don't know. You can't know. Your logs are a story your systems tell about themselves, and stories can be rewritten.
>
> Now imagine a different version of that phone call. Every message between those four agents was signed by the agent that sent it. Every hop is cryptographically linked to what it was derived from. The moment compliance received a message, the system could already tell whether it matched, byte for byte, what risk actually sent. And the entire sequence — every message, every verification, every access — sits in a ledger where altering a single past record breaks a chain anyone can check.
>
> You don't tell the regulator "we believe our logs are accurate." You press replay.

**That's the gap `sigilog` closes.** It doesn't make agents smarter — it makes their conversations provable.

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


---

## Getting started

```bash
git clone https://github.com/MelancholicMelon/sigilog.git
cd sigilog
# see contracts/transport.md for ports, endpoints, and runtime paths
```

Each of `protocol/`, `infra/`, and `ui/` runs independently against the schemas in `contracts/` — see `contracts/README.md` for the exact bring-up sequence.

---

## Status

Early-stage hackathon build. Protocol contracts are frozen; components are under active development. Not production-hardened — see `PLAN.md` §10 for known limitations (centralized registry, delivery isn't guaranteed, a compromised agent can still sign nonsense) and the roadmap for where this goes next.

## License

TBD.
