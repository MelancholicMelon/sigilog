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
├── launch.sh          # one-command demo launcher (relay + UI + scenario shell)
├── contracts/         # frozen protocol contracts — the source of truth
│   ├── envelope.schema.md   # envelope structure, canonicalization, hashing, signing
│   ├── ledger.schema.md     # ledger records, hash-chain rule, genesis
│   ├── events.schema.md     # relay → UI live event stream
│   ├── sdk.api.md           # SDK signatures + canonical error codes
│   ├── transport.md         # ports, endpoints, runtime paths, agent IDs
│   └── fixtures/            # golden signed envelopes (valid / forged / tampered)
├── protocol/          # Python: identity, envelope signing/sealing, SDK, demo agents
├── infra/             # Node: relay, hash-chained ledger, independent auditor, replay
├── ui/                # React: live agent graph, ledger panel, inspector, oversight, replay
└── runtime/           # generated at run time: keys, registry, ledger (gitignored)
```

The protocol SDK is **Python** and the relay/auditor are **Node.js** — deliberately.
The auditor re-implements canonicalization and Ed25519 verification from the written
contracts alone, so every green checkmark is a genuine cross-language, third-party
verification, not the SDK grading its own homework.

---

## Getting started

**Prerequisites:** Node.js ≥ 18, Python ≥ 3.11 (non-Anaconda), `tmux([How to install tmux](https://github.com/tmux/tmux/wiki/installing))`.

```bash
git clone https://github.com/MelancholicMelon/sigilog.git
cd sigilog

# one-time setup
python3 -m venv .venv && source .venv/bin/activate
pip install -r protocol/requirements.txt
(cd infra && npm install)
(cd ui && npm install)

# launch everything (relay :8080 + UI :3000 + scenario shell, in tmux)
./launch.sh
```

Then open **http://localhost:3000/?feed=real** and, from the scenario pane (or the UI's
run button), start the pipeline:

```bash
python protocol/agents/runner.py start
```

**Tamper demo** — flip the malicious-relay toggle in the UI (or
`curl -X POST localhost:8080/relay/malicious -H 'content-type: application/json' -d '{"enabled":true}'`)
and run the scenario again: the relay corrupts the risk assessment in flight, the
compliance agent rejects it with `ERR_SIG_INVALID`, and the pipeline halts before a
decision is ever made.

**Independent audit** — at any point:

```bash
cd infra && npm run audit   # exit 0 ⇔ chain intact + every signature re-verifies
```

---

## Status

Hackathon build. Protocol contracts under `contracts/` are frozen and both
implementations conform to them (the Node auditor verifies the Python SDK's signed
golden fixtures byte-for-byte). Not production-hardened: the registry is centralized,
delivery isn't guaranteed, and a compromised agent can still sign nonsense — `sigilog`
proves *who said what and how it traveled*, not that it was wise.

## License

TBD.
