# PLAN.md — Verifiable Agent-to-Agent Communication Layer

Working name suggestions: **Provenance Wire**, **AgentSeal**, **Chainlink Context**, **Attest** (pick one; short, infrastructure-sounding names judge well).

---

## 1. Refined Product Vision

**One-sentence pitch:**
> A trust and provenance layer for multi-agent AI systems — every message between agents is signed, sealed, and permanently auditable, so organizations can answer *who said what, when, to whom, and whether it was tampered with*.

**Positioning statement:**
Current multi-agent ecosystems (orchestration frameworks, tool-calling pipelines, agent marketplaces) exchange raw context: plain JSON, plain prompts, plain API payloads. There is no standard way to verify origin, detect tampering, restrict access, or reconstruct decision chains. This project is **not** an agent framework and **not** a memory store — it is the *transport and ledger layer beneath them*, analogous to what TLS + git + an audit log would be for agents. Any agent framework can sit on top.

**The core value proposition, stated as five guarantees:**

| Guarantee | Question it answers |
|---|---|
| **Authenticity** | Which agent actually produced this message? |
| **Integrity** | Has the content changed since it was signed? |
| **Confidentiality** | Can only the intended recipient read the sensitive payload? |
| **Provenance** | Through which agents did this information travel, and was it transformed? |
| **Replayability** | Can we reconstruct and re-watch the exact sequence of events? |

**Design principle for the hackathon:** clarity over scale. Three or four agents, one visible ledger, one live tamper demonstration. The demo should make a non-technical judge *feel* the difference between "trust me" and "verify it."

---

## 2. Overall System Architecture

Four conceptual layers, from bottom to top:

```
┌─────────────────────────────────────────────────────────┐
│  4. Observability Layer                                 │
│     Live visualization + audit replay UI                │
├─────────────────────────────────────────────────────────┤
│  3. Ledger Layer                                        │
│     Append-only, hash-chained event log (tamper-        │
│     evident history of every envelope + access event)   │
├─────────────────────────────────────────────────────────┤
│  2. Protocol Layer ("the envelope")                     │
│     Signed, optionally encrypted message envelopes      │
│     with provenance metadata and content hashes         │
├─────────────────────────────────────────────────────────┤
│  1. Identity Layer                                      │
│     Agent registry: each agent has a keypair +          │
│     a verifiable identity record                        │
└─────────────────────────────────────────────────────────┘
        ▲                                       ▲
        │ SDK / client library                  │
   ┌────┴─────┐   ┌──────────┐   ┌──────────┐
   │ Agent A  │   │ Agent B  │   │ Agent C  │   ← demo agents
   └──────────┘   └──────────┘   └──────────┘
```

**Topology choice for the demo:** a single relay/broker node that all agents connect to. This is architecturally honest to admit (see §10) but ideal for a hackathon: one place to intercept, log, and visualize traffic. The security model does **not** depend on trusting the relay — the relay only sees sealed envelopes and cannot forge or (for encrypted payloads) read them. That's the key architectural talking point: *the transport is untrusted; trust lives in the cryptography.*

---

## 3. Components and Responsibilities

### 3.1 Agent Identity Registry
- Issues or records each agent's identity: a stable agent ID bound to a public key, plus human-readable metadata (name, role, owning organization).
- Answers "whose key is this?" during verification.
- Hackathon scope: an in-memory or single-file registry seeded at startup. Real-world framing: this maps to a PKI, DID registry, or enterprise certificate authority.

### 3.2 Envelope Protocol (the heart of the project)
Defines the canonical message format. Each envelope contains:
- **Header:** envelope ID, sender ID, recipient ID(s), timestamp, message type, protocol version.
- **Provenance block:** hash of the parent envelope(s) this message derives from (forming a DAG of causality), plus an ordered hop history.
- **Payload:** the actual context. Two modes — plaintext (integrity-only) or sealed (encrypted for a specific recipient).
- **Content hash:** digest of the canonicalized payload.
- **Signature:** sender signs the header + provenance + content hash.

Responsibilities: canonical serialization (so hashes are reproducible), signing, verification, sealing/unsealing.

### 3.3 Relay / Message Bus
- Routes envelopes between connected agents.
- Forwards *everything* to the ledger — including delivery events and access events.
- Deliberately "dumb": it cannot alter envelopes without breaking signatures, and cannot read sealed payloads.

### 3.4 Append-Only Ledger
- Every event (envelope sent, delivered, opened, verification passed/failed) is appended as a record.
- Each record includes the hash of the previous record → a hash chain. Modifying any historical record invalidates every subsequent hash.
- Exposes two read APIs: *stream* (for live visualization) and *range query* (for replay/audit).
- Hackathon scope: single local append-only store. Real-world framing: replicated log, WORM storage, or anchoring periodic checkpoints externally.

### 3.5 Verifier / Auditor Module
- Independent component (importantly: *not* the relay) that can, given the ledger and the registry, re-verify every signature and re-check the entire hash chain.
- This is what you run live during the demo after tampering with a record.

### 3.6 Agent SDK (thin client)
- What a demo agent calls: `send(context, to, derived_from)`, `receive() → verified context`, `verify(envelope)`.
- Hides crypto details; the agent developer experience is 3–4 function calls. Judges love seeing how small the integration surface is.

### 3.7 Visualization & Replay UI
- Graph view of agents as nodes; envelopes animate along edges as they flow.
- Ledger panel: scrolling list of hash-chained records with ✅/❌ verification badges.
- Provenance inspector: click any message → see its full ancestry chain back to the original source.
- Replay mode: scrub through history and re-animate the sequence at chosen speed.

---

## 4. Communication Lifecycle Between Agents

The canonical happy path, which the demo narrates step by step:

1. **Registration.** Agent generates a keypair, registers its public key + metadata with the registry. It now has a verifiable identity.
2. **Compose.** Agent A produces context (e.g., "market analysis result") and calls `send()`, referencing the parent envelope(s) it derived from (empty for original content).
3. **Seal.** SDK canonicalizes the payload, computes the content hash, optionally encrypts the payload for Agent B, builds the provenance block, and signs the whole thing with A's private key.
4. **Transmit.** Envelope goes to the relay. The relay appends a `SENT` record to the ledger and routes it.
5. **Deliver.** Relay appends `DELIVERED`; Agent B's SDK receives the envelope.
6. **Verify.** B's SDK: (a) looks up A's public key, (b) checks the signature, (c) recomputes the content hash, (d) checks the provenance parents exist in the ledger. Only if all pass does the payload get handed to B's logic. `VERIFIED` is appended.
7. **Access.** If sealed, B unseals it; an `OPENED` record is appended — this is what makes "who has accessed it" answerable.
8. **Derive & forward.** B transforms the context and sends to C, citing A's envelope as parent. The provenance DAG grows: C can trace its input back to A *without trusting B's word for it*.
9. **Audit / replay.** At any later time, the auditor replays the ledger: re-verifies every record, reconstructs the DAG, and re-animates the flow.

**Failure paths to demonstrate explicitly:**
- **Forgery:** an agent sends an envelope claiming to be A but signed with the wrong key → verification fails at step 6, message rejected, `VERIFICATION_FAILED` logged.
- **In-flight tampering:** payload modified after signing → content hash mismatch → rejected.
- **Historical tampering:** someone edits an old ledger record → hash chain breaks at that record → auditor flags exactly where history was altered.
- **Unauthorized access:** Agent C receives a sealed envelope addressed to B → cannot decrypt; the attempt can be logged.

---

## 5. Security and Trust Model

**Trust assumptions (state these explicitly in the presentation — it signals maturity):**
- Each agent's private key is secret to that agent.
- The registry's binding of ID → public key is correct (registry is the trust root; in production this becomes a CA/DID system).
- The relay and the ledger storage are **untrusted for integrity and confidentiality** — they are trusted only for availability. This is the strongest and most interesting claim.

**Mechanisms mapped to guarantees:**

| Guarantee | Mechanism |
|---|---|
| Authenticity | Digital signature over the envelope by the sender's private key; verified against the registry |
| Integrity (in flight) | Content hash inside the signed region; any mutation breaks signature or hash |
| Integrity (at rest / history) | Hash-chained ledger records; tampering breaks the chain forward |
| Confidentiality | Payload sealed (encrypted) to the recipient's public key; relay/ledger store only ciphertext + hash |
| Non-repudiation | Sender cannot deny an envelope carrying their valid signature in an intact chain |
| Provenance authenticity | Parent references are *hashes of signed envelopes*, so lineage can't be fabricated after the fact |

**Threat model (a slide-worthy table):** malicious peer agent (forgery, replay), compromised relay (drop/reorder/inspect), post-hoc ledger editor (history rewrite), curious eavesdropper (read sensitive context). For each: which mechanism defeats it, and — honestly — what's out of scope (e.g., a fully compromised agent leaking its own decrypted data; denial of service; key theft). See §10.

**Replay-attack note:** envelope IDs + timestamps + ledger presence give basic replay detection (a re-submitted old envelope is either a duplicate ID or has an already-seen hash). Mention it; don't over-engineer it.

---

## 6. Audit and Provenance Model

Two intertwined structures:

**A. The hash-chained event ledger (time dimension).**
An append-only sequence: `record_n` includes `hash(record_{n-1})`. Record types: `REGISTERED`, `SENT`, `DELIVERED`, `VERIFIED`, `OPENED`, `VERIFICATION_FAILED`. This gives total ordering, tamper evidence, and the raw material for replay. Verification of the entire history is a single linear pass.

**B. The provenance DAG (causality dimension).**
Each envelope references parent envelope hashes. This forms a directed acyclic graph across agents: *"C's recommendation ← B's transformation ← A's original data."* Because parents are referenced by hash of signed content, the lineage itself is cryptographically bound — you cannot later claim different ancestry.

**Queries the model answers (turn these into demo moments):**
- "Show me everything derived from envelope X" → forward walk of the DAG.
- "What is the origin of this decision?" → backward walk to root(s).
- "Who accessed the salary data context?" → filter `OPENED` records for that envelope.
- "Was anything modified between Tuesday and now?" → run the auditor; chain either verifies or pinpoints the break.
- "Replay the incident" → stream ledger records back through the visualizer.

**Compliance framing:** this is effectively a machine-generated, tamper-evident audit trail — the language of SOC 2, HIPAA audit controls, EU AI Act traceability requirements, and financial-services record-keeping. Name-drop one or two, not all.

---

## 7. User-Facing Demonstration (Hackathon Demo Script)

**Scenario: a regulated loan-approval pipeline** (concrete, high-stakes, universally understood).

Cast of agents:
- **Intake Agent** — receives a loan application (contains sensitive PII).
- **Risk Agent** — computes a risk assessment from the application.
- **Compliance Agent** — checks the assessment against policy.
- **Decision Agent** — issues approve/deny, derived from all upstream context.

**Demo flow (~4 minutes):**

1. **The happy path (60s).** Kick off an application. The audience watches envelopes animate across the agent graph while the ledger panel fills with green-check records. Click the final decision → the provenance inspector unfolds the full ancestry back to the intake data. Punchline: *"The decision carries its own receipts."*
2. **Confidentiality (30s).** Show that the PII payload is sealed: the relay/ledger view displays ciphertext + hash only; only the Risk Agent's `OPENED` event appears. *"Even our own infrastructure can't read the application."*
3. **The attack — live tampering (90s).** The showstopper. Two variants, do at least one:
   - **In-flight:** a "malicious" toggle makes the relay mutate a risk score from `HIGH` to `LOW` mid-transit. The Compliance Agent's verification instantly fails — red ❌ in the UI, message rejected, failure logged. *"The fraud never reaches the decision."*
   - **Historical:** open the ledger file/store on screen, hand-edit an old record, run the auditor. The chain visibly breaks at exactly the edited record. *"You can rewrite history — but you can't hide that you did."*
4. **Replay (45s).** Scrub the timeline back to zero and replay the whole incident at 4× speed, tampering attempt and all. *"Six months later, a regulator can re-watch this exact sequence and re-verify every signature."*
5. **Close (15s).** One slide: the five guarantees, the ~4-call SDK surface, and "any agent framework plugs in on top."

**Presentation tips:** keep the agents' AI logic trivially simple (even scripted/canned responses are fine — the intelligence is not the point, the *pipes* are). Make the tamper toggle a big obvious button. Rehearse the historical-tamper edit so it takes 10 seconds, not 60.

---

## 8. Phased Roadmap (~5 hours)

Ordered so that **every phase ends with something demoable** — if time runs out, you cut from the bottom, not the middle.

| Phase | Time | Deliverable | Demo-able outcome if you stopped here |
|---|---|---|---|
| **0. Skeleton & contracts** | 0:00–0:30 | Envelope schema, ledger record schema, registry shape, SDK function signatures. Decide canonical serialization rules *now* (this is the classic time sink if deferred). | A written protocol spec — itself presentable. |
| **1. Identity + signed envelopes** | 0:30–1:30 | Keypair generation, registry, sign/verify round trip between two in-process agents. Include one deliberate forgery test that fails. | "Agent B verified a message really came from Agent A — and rejected a forged one." |
| **2. Relay + hash-chained ledger** | 1:30–2:30 | Central relay routing envelopes; every event appended to the hash-chained log; auditor that walks and validates the chain. | Console-level end-to-end flow with a verifiable audit log. |
| **3. Tampering demos** | 2:30–3:15 | The malicious-relay toggle (in-flight mutation → rejection) and the historical-edit → chain-break detection. | The two showstopper moments work, even if only in a terminal. |
| **4. Visualization** | 3:15–4:30 | Agent graph with animated message flow, live ledger panel with ✅/❌, provenance inspector on click. Simple > pretty; even a minimal web view with polling beats a fancy one that's half-built. | The full visual demo. |
| **5. Sealed payloads + replay + polish** | 4:30–5:00 | Encrypt one payload type (the PII one) to demonstrate confidentiality; ledger-driven replay with a speed control; demo script rehearsal. | Complete narrative from §7. |

**Scope discipline rules:**
- One relay, 3–4 agents, one scenario. Resist adding agents.
- Agents' "AI" can be canned. Do not spend hackathon minutes prompting models.
- If Phase 4 runs long, a table/log-based UI with color-coded rows is an acceptable fallback; the tamper moment still lands.
- Confidentiality (encryption) is deliberately in Phase 5 because signatures + hash chain alone already deliver 80% of the demo. If squeezed, *claim* sealing in the architecture and demo only integrity/provenance — but say so honestly.

---

## 9. Stretch Goals (only if time remains)

Ranked by demo-impact per minute of effort:

1. **Access-control policies on envelopes** — e.g., "Compliance Agent may read the risk score but not the raw PII." Shows field-level thinking.
2. **External anchoring** — periodically publish the ledger head hash somewhere outside the system (even a public gist/timestamp). One line of narrative: "now even *we* can't rewrite history."
3. **Cross-organization framing** — two registries ("Bank A", "Vendor B") whose agents interoperate; demonstrates the federation story.
4. **Revocation** — mark an agent's key compromised; show that its past messages remain valid-at-time-of-signing while new ones are rejected.
5. **Exportable audit report** — one click generates a human-readable audit document from the ledger (judges in enterprise-flavored hackathons love a PDF artifact).
6. **Framework adapter** — a tiny shim showing an existing agent framework's message hook routed through your SDK, proving the "infrastructure layer, not framework" claim.

---

## 10. Weaknesses, Challenges, and How to Handle Them in Judging

Be preemptively honest — judges reward teams that know their own limits.

**a. "Isn't this just TLS / JWT / blockchain?"** — The most likely challenge. Answer: those are the right *primitives*; the contribution is the *protocol and provenance model specialized for agents* — the envelope schema, the causality DAG across agents, access events as first-class records, and replayability. TLS secures a channel; this secures the *artifact and its history* across many hops and parties. Also explicitly say it is **not** a blockchain: no consensus, no tokens — just a hash-chained log, which is cheaper and sufficient for a single-operator or federated audit trail.

**b. The registry is a trust root / single point of failure.** — True. Own it: "for the hackathon the registry is centralized; in production it maps to enterprise PKI or decentralized identifiers." Having this sentence ready converts a weakness into a roadmap slide.

**c. The relay could drop or delay messages.** — Correct: the design guarantees tamper-*evidence*, not delivery. Signed envelopes + ledger gaps make censorship *detectable* (sender's `SENT` with no `DELIVERED`), not preventable. Framing: "we guarantee you can't be lied to; we don't guarantee you can't be ghosted."

**d. Garbage in, signed garbage out.** — Signatures prove *who said it*, not *that it's true*. A compromised or hallucinating agent signs its own nonsense. Counter-framing: that is exactly why provenance matters — when the bad output is found, you can trace precisely which agent produced it and everything downstream that it contaminated. Accountability, not omniscience.

**e. A compromised agent can leak decrypted content.** — Out of scope, and every real system shares this limit. Say it once, move on.

**f. Performance / scale questions.** — Don't get dragged in. "The ledger is an append-only log — the most scalable data structure in industry (cf. commit logs). Verification is linear and parallelizable. Scale was explicitly out of scope for a 5-hour build."

**g. Demo risk: crypto demos are invisible.** — Everything happens in math; nothing *looks* different. This is why the visualization and the live-tamper red ❌ are not polish — they *are* the demo. Budget the time accordingly (Phase 4 is 75 minutes for a reason).

**h. Differentiation risk: "agent security" is a crowded hackathon theme.** — Sharpen the wedge: most entries do guardrails/prompt-injection defense (content safety). You are doing *transport trust and auditability* (communications security). One sentence of contrast early in the pitch prevents mental mis-filing by judges.

**Recommendations to maximize judging impact:**
1. Lead with a question, not architecture: *"An AI agent at your bank just approved a loan. Can you prove why?"*
2. Make the tamper moment interactive — invite a judge to press the "corrupt the message" button themselves.
3. Show the SDK surface (4 calls) on one slide: adoption story in ten seconds.
4. Name one regulation (EU AI Act traceability *or* HIPAA audit controls) — one is credible, five is buzzword soup.
5. End on the replay: watching history re-verify itself is the emotional close.

---

## Appendix: Canonical Envelope (conceptual shape)

```
Envelope {
  header {
    envelope_id            // unique
    protocol_version
    sender_id              // resolves to public key via registry
    recipient_ids[]        
    timestamp
    message_type           // e.g. CONTEXT, REQUEST, RESULT
  }
  provenance {
    parent_hashes[]        // hashes of envelopes this derives from
    hop_history[]          // ordered agent IDs (informational)
  }
  payload {
    mode                   // PLAINTEXT | SEALED
    content | ciphertext
  }
  content_hash             // hash of canonicalized payload plaintext
  signature                // sender's signature over header+provenance+content_hash
}

LedgerRecord {
  sequence_number
  prev_record_hash         // the chain
  event_type               // SENT | DELIVERED | VERIFIED | OPENED | VERIFICATION_FAILED | REGISTERED
  envelope_id / envelope_hash
  actor_id
  timestamp
  record_hash              // hash of this record incl. prev_record_hash
}
```

Everything above is implementation-agnostic: any signature scheme, any hash function, any transport, any storage that supports append semantics will do.

---

## 11. Submission Deliverables Checklist

Four required artifacts. Assign an owner to each (see §12) and treat them as first-class tasks, not afterthoughts — teams routinely lose to weaker projects with better-packaged submissions.

### 11.1 Problem Statement & Solution Approach (RFS alignment)
One page, four beats:
1. **Problem:** Multi-agent AI systems are moving into production, but agents exchange plain, unverifiable context. No one can answer: who produced this? was it altered? who accessed it? why did the system decide this?
2. **Why now:** agent-to-agent ecosystems (marketplaces, cross-org agent workflows, protocols like A2A/MCP) are exploding while regulation (EU AI Act traceability, financial record-keeping, HIPAA audit controls) demands exactly the guarantees agents currently lack. The gap between adoption and accountability is the RFS-shaped hole.
3. **Solution:** a trust and provenance layer — signed envelopes, hash-chained audit ledger, provenance DAG, sealed payloads, full replay. Infrastructure beneath any agent framework, not another framework.
4. **Approach:** map each of the five guarantees (§1) to its mechanism (§5) in one table. Reviewers can grasp the whole design in ten seconds.

> Tailor beat 2 to the actual RFS text word-for-word — mirror their vocabulary. If the RFS says "trust infrastructure for AI," your problem statement should contain the phrase "trust infrastructure for AI."

### 11.2 Product / Technology / Business Model Overview
- **Product:** "TLS + git for AI agents." SDK (4 calls) + relay + verifiable ledger + audit console. Buyer: platform/infra teams deploying multi-agent systems in regulated or multi-party settings.
- **Technology:** the §2 layer diagram plus one paragraph per layer. Emphasize the two novel bits: the *provenance DAG bound by signed hashes* and *access events as first-class ledger records*.
- **Business model (open-core infrastructure playbook):**
  - **Open:** the protocol spec + SDK — free, to drive adoption and become the standard (protocols win by ubiquity).
  - **Paid:** hosted ledger + audit console, per-agent or per-million-envelopes pricing; enterprise tier adds compliance report exports, retention policies, SSO, external anchoring.
  - **Wedge market:** financial services and healthcare AI deployments where audit trails are mandatory — they buy compliance, not cryptography.
  - Comparable narratives judges recognize: how TLS certificate authorities, Auth0 (identity-as-a-service), and Datadog (observability) monetized infrastructure layers.

### 11.3 Demo Video (≤ 90 seconds)
Shot-by-shot script — compress §7 to its three emotional beats:

| Time | Shot | Voiceover |
|---|---|---|
| 0–10s | Title + one killer question | "An AI agent at your bank just approved a loan. Can you prove why?" |
| 10–30s | Happy path: envelopes animate across the 4-agent graph, ledger fills with ✅ | "Every message between agents is signed and chained into a tamper-evident ledger. Click any decision — it carries its full ancestry." |
| 30–55s | **The tamper moment.** Press the corrupt button; risk score mutated in flight; big red ❌; message rejected | "A compromised relay flips HIGH risk to LOW. Verification fails instantly. The fraud never reaches the decision." |
| 55–75s | Historical edit → auditor pinpoints the broken chain link; then replay scrubber re-runs history at 4× | "Edit history, and the chain breaks exactly where you touched it. Six months later, a regulator can replay everything." |
| 75–90s | Five guarantees + SDK slide + logo | "Four function calls. Any agent framework. [Name]: the trust layer for multi-agent AI." |

Production rules: record the screen at final UI state, voiceover recorded separately over it (never live narration), no dead air, captions burned in (many judges watch muted), and get to the tamper moment before the 50% mark — that's your hook.

### 11.4 Market & Global Expansion Perspective
- **Market logic (bottom-up):** every production multi-agent deployment in a regulated industry needs an audit trail; today each team hand-rolls logging with zero verifiability. TAM rides the agentic-AI market itself — position as a % attach rate on agent infrastructure spend, the way security/observability attaches to cloud spend. Avoid inventing precise dollar figures; judges punish fake precision. "Security and observability historically capture 5–10% of the infrastructure spend they attach to" is a defensible frame.
- **Global-by-design argument:** the product is a *protocol* — inherently borderless, like TLS. Regulation is the go-to-market map, not a barrier:
  - **EU:** AI Act traceability/logging obligations → earliest compliance-driven demand.
  - **US:** financial services (SEC/FINRA record-keeping) and healthcare (HIPAA audit controls).
  - **Japan/APAC:** government AI guidelines emphasizing accountability; strong enterprise appetite for auditability in finance and manufacturing robotics.
  - **Cross-border:** the strongest expansion story — when agents from *different organizations in different jurisdictions* interact, neither side trusts the other's logs; a shared verifiable ledger is the only neutral ground. Federation (§9.3) is the expansion mechanism.
- **Localization cost:** near zero — no content, no language dependency; only compliance-report templates vary by jurisdiction. Infrastructure protocols expand globally by default.

---

## 12. Team Split (3 Members)

**Principle:** after a 30-minute all-hands, the three workstreams touch each other only through the schemas frozen in Phase 0. Mock everything across boundaries; integrate twice.

### Kickoff — ALL THREE together (0:00–0:30)
Freeze the contracts: envelope schema, ledger record schema, registry shape, SDK signatures, and the relay↔UI event format. Write them in a shared file. **No one changes a schema afterward without a 60-second team huddle** — schema drift is the #1 way 3-person hackathon teams lose two hours.

### Member A — Protocol & Crypto ("the envelope")
- 0:30–1:30: keypairs, registry, canonical serialization, sign/verify round trip, forged-message rejection test.
- 1:30–2:30: SDK wrapper (`send/receive/verify`), provenance parent-hash handling.
- 2:30–3:30: sealed (encrypted) payload mode for the PII envelope.
- 3:30–4:30: the 4 scripted demo agents (canned logic) wired through the SDK.
- 4:30–5:00: integration & rehearsal.
- **Owns submission item:** technology section of 11.2.

### Member B — Infrastructure ("the ledger")
- 0:30–1:30: relay routing loop with A's schemas mocked; event fan-out to UI (so C unblocks early — even fake events).
- 1:30–2:30: hash-chained append-only ledger + independent auditor pass.
- 2:30–3:15: the two attack paths — malicious-relay toggle (in-flight mutation) and the historical-edit chain-break demo.
- 3:15–4:15: replay API (range query + timed re-emission of events to the UI).
- 4:15–5:00: integration & rehearsal.
- **Owns submission items:** problem statement (11.1) — B has the deepest view of what the mechanisms actually guarantee.

### Member C — Demo, UI & Packaging ("the story")
- 0:30–1:45: agent-graph view + ledger panel driven entirely by **fake/mocked events** matching the frozen format. Do not wait for B.
- 1:45–2:45: provenance inspector (click → ancestry), ✅/❌ verification badges, the big red "corrupt message" button UI.
- 2:45–3:30: swap mocked events for B's real feed; replay scrubber UI.
- 3:30–4:15: **record the demo video** per the 11.3 script (record early — the last hour is always chaos), draft slides.
- 4:15–5:00: business model + market sections (11.2, 11.4), final rehearsal as narrator.
- **Owns submission items:** demo video (11.3), business/market (11.2 business half, 11.4), pitch narration.

### Integration checkpoints (hard stops, everyone)
- **2:30 — Checkpoint 1:** A's real envelopes flow through B's real relay into C's UI. Budget 15 minutes; if it takes longer, the schemas drifted — fix the schema, not the symptoms.
- **4:15 — Checkpoint 2 / feature freeze:** full demo run-through. After this: only bug fixes, rehearsal, and submission polish. Nothing new. Ever.

### If someone finishes early
Priority order for spare capacity: help C polish the tamper moment (it's the whole demo) → sealed-payload demo → stretch goal #5 (exportable audit report — cheap and judges love the artifact) → extra video takes.


---

## 13. Parallel Work Protocol (3 Simultaneous Workers)

This section makes the §12 split executable when all three members (or three coding-agent sessions) work **at the same time in the same repository**. The rules exist to guarantee zero merge conflicts and a mechanical, boring integration. Read your member brief (§13.4) before writing any code.

### 13.1 Repository Layout & Ownership Zones

```
repo/
├── PLAN.md                  # this file — read-only during the build
├── contracts/               # ⚠️ SHARED — frozen after Phase 0 (see 13.2)
│   ├── envelope.schema      # canonical envelope structure + serialization rules
│   ├── ledger.schema        # ledger record structure + hashing rules
│   ├── events.schema        # relay→UI event format (what C's UI consumes)
│   ├── sdk.api              # SDK function signatures + error codes
│   └── fixtures/            # golden sample files (see 13.3)
├── protocol/                # 🅰 Member A ONLY
│   ├── identity/            # keypairs, registry
│   ├── envelope/            # build, sign, verify, seal, unseal
│   ├── sdk/                 # send / receive / verify wrapper
│   └── agents/              # the 4 scripted demo agents
├── infra/                   # 🅱 Member B ONLY
│   ├── relay/               # routing + malicious-mutation toggle
│   ├── ledger/              # append-only hash-chained store
│   ├── auditor/             # independent chain + signature re-verification
│   └── replay/              # range query + timed event re-emission
├── ui/                      # 🅲 Member C ONLY
│   ├── graph/               # agent graph + animated envelope flow
│   ├── ledgerpanel/         # scrolling records, ✅/❌ badges
│   ├── inspector/           # provenance ancestry view
│   ├── replay/              # timeline scrubber
│   └── mockfeed/            # fake event generator (deleted at Checkpoint 2)
├── integration/             # SHARED, but append-only: each member adds tests, never edits others'
└── submission/              # 🅲 Member C ONLY (video script, slides, writeups)
```

**The one rule that prevents all merge pain:** you may create/edit files *only* inside your own zone. If you need something changed in another zone, you ask that member — you never edit it yourself. If you need something changed in `contracts/`, you call a huddle (13.2).

### 13.2 The Contracts Directory — Single Source of Truth

Produced by **all three members together** during Phase 0 (0:00–0:30). It is the *only* coupling point between the three workstreams.

Rules:
1. After 0:30, `contracts/` is **frozen**. Any change requires all three members present, takes ≤60 seconds of discussion, and the person who requested it announces the change to the group immediately after.
2. Every contract file must be concrete enough to code against blindly: exact field names, exact field order for canonical serialization, what gets hashed, what gets signed, exact event type strings (`SENT`, `DELIVERED`, `VERIFIED`, `OPENED`, `VERIFICATION_FAILED`, `REGISTERED`).
3. Ambiguity discovered mid-build = a contract bug. Fix the contract file first, then the code. Never resolve ambiguity silently in your own zone — the other two will resolve it differently.
4. `contracts/` includes **error behavior**, not just happy path: what a failed verification returns, what a rejected envelope event looks like. C's red ❌ depends on this being specified.

Minimum Phase-0 decisions to write down (do not defer any of these):
- Canonical serialization rule (field ordering, encoding) — hashes are irreproducible without it.
- Exactly which bytes are signed (header + provenance + content_hash, in what concatenation).
- Envelope ID and hash formats (so they can be eyeballed in logs).
- The event stream shape C subscribes to, including one sample of every event type.
- Transport between components (e.g., local socket / HTTP / message queue — pick ONE, write it down).

### 13.3 Fixtures: The Integration Currency

The secret to painless integration is exchanging **files, not promises**. Each member deposits golden artifacts into `contracts/fixtures/` as soon as they exist:

| Fixture | Produced by | Consumed by | Deadline |
|---|---|---|---|
| `sample_keys` + `sample_registry` | A | B (verification in auditor) | 1:00 |
| `golden_envelope.valid` — a real signed envelope | A | B (relay/ledger tests) | 1:30 |
| `golden_envelope.forged` — bad signature | A | B (rejection path) | 1:30 |
| `golden_envelope.tampered` — payload mutated after signing | A | B | 1:45 |
| `sample_event_stream` — 20 realistic events, every type ≥1 | B (format), C (mock version first) | C's UI | C's mock at 0:45; B's real one at 2:15 |
| `sample_ledger.valid` + `sample_ledger.broken_chain` | B | C (auditor/replay UI), integration tests | 2:30 |
| `sealed_envelope.sample` | A | B, C | 3:30 |

Rule: **never delete or modify a fixture another member already consumes** — add a new versioned one if needed.

Each member also writes one test in `integration/` that loads the other members' fixtures and exercises their own code against them (e.g., B's ledger ingests A's `golden_envelope.valid` and rejects `golden_envelope.forged`). These tests are the checkpoint gate.

### 13.4 Member Briefs (paste your own brief into your session and follow it)

---

**🅰 MEMBER A — Protocol & Crypto.**
You own `protocol/` and nothing else. Your consumers are B (who feeds your envelopes through the relay/ledger) and the demo agents themselves.
- Build in this order: identity/registry → canonical serialization → sign/verify → SDK wrapper → demo agents → sealed payloads.
- Deposit fixtures on the 13.3 schedule; B is blocked on your golden envelopes at 1:30 — that deadline is your top priority after Phase 0.
- Your SDK must return the exact error codes named in `contracts/sdk.api` on verification failure — C's UI displays them verbatim.
- Your demo agents send/receive **only** through your own SDK and the transport named in contracts — no side channels, or the ledger (and therefore the demo) won't see the traffic.
- Do NOT build any storage, routing, or UI. If you're tempted to "quickly log something," that's B's ledger's job.

---

**🅱 MEMBER B — Infrastructure.**
You own `infra/` and nothing else. You consume A's envelopes (as opaque signed blobs — you verify via A's published verify function or fixtures, you never re-implement crypto) and you produce the event stream C renders.
- Build in this order: relay routing (against A's fixtures, mocked until 1:30) → hash-chained ledger → auditor → the two attack paths → replay API.
- **Emit the event stream from the very first hour**, even with placeholder envelopes — C integrates against your stream at 2:15; publish `sample_event_stream` and keep it accurate.
- Your malicious-relay toggle must be reachable from outside (a flag/endpoint C's big red button can hit) — coordinate the trigger name into `contracts/events.schema`.
- The auditor must be runnable standalone against a ledger file — the historical-tamper demo is: stop, hand-edit, run auditor, show the break.
- Do NOT touch envelope construction or signing internals, and do NOT build UI.

---

**🅲 MEMBER C — Demo, UI & Packaging.**
You own `ui/` and `submission/` and nothing else. You consume B's event stream — but for the first ~90 minutes you consume **your own `mockfeed/`**, which fabricates events exactly matching `contracts/events.schema` (including failure events, so the red ❌ path is built before real tampering exists).
- Build in this order: mockfeed → graph + ledger panel → inspector + badges + corrupt-button UI → swap mockfeed for B's real stream (2:45) → replay scrubber → record video (3:30) → slides/writeups.
- The corrupt button calls B's toggle (name in contracts). Wire it, then test the full red-❌ path end to end — this is the demo's centerpiece; escalate immediately if it's flaky.
- Delete/disable `mockfeed/` at Checkpoint 2 so the demo can never accidentally show fake data.
- Record the video at 3:30 sharp even if polish is missing; re-record later only if time genuinely allows.
- Do NOT reach into `protocol/` or `infra/` code — if the stream lacks data your UI needs, that's a contracts huddle, not a workaround.

---

### 13.5 Sync & Merge Discipline

- Work on separate branches (`member-a`, `member-b`, `member-c`) or, if working in one shared workspace, rely on the zone rule — either way, conflicts are structurally impossible if 13.1 is respected.
- **Merge/pull cadence: every 30–45 minutes**, plus immediately after depositing any fixture. Long-lived divergence is how "it worked on my side" happens.
- Commit messages start with your zone tag (`[A]`, `[B]`, `[C]`, `[contracts]`) so history doubles as a build log.
- At **Checkpoint 1 (2:30)**: everyone merges; run all `integration/` tests; A's real envelope must travel relay → ledger → C's UI. Time-box 15 minutes. Failures at this point are contract bugs by definition — fix in `contracts/` first.
- At **Checkpoint 2 (4:15)**: merge, feature-freeze, full demo run-through with mockfeed removed. After this, only `[fix]` and `submission/` commits are allowed.
- **Escalation rule:** stuck for more than 15 minutes on anything → say so out loud. Two hackathon-hours of silent struggling is worth more than any feature.

### 13.6 Who Is Blocked on Whom (dependency map)

```
0:00–0:30   ALL → contracts/           (nobody codes before this exists)
0:30–1:30   A: unblocked   B: mocked envelopes   C: mockfeed (unblocked)
1:30        A ─golden envelopes─▶ B    (B swaps mocks for real)
2:15        B ─event stream─▶ C        (C dual-runs mock + real)
2:30        CHECKPOINT 1: end-to-end real path
2:45        C fully on real stream
3:30        A ─sealed payloads─▶ B,C   (last cross-zone handoff)
4:15        CHECKPOINT 2: freeze
```

The only hard serial dependencies are the two arrows at 1:30 and 2:15. Everything else is embarrassingly parallel — which is the entire point of this section.

---

## 14. Phase 0 Is Pre-Completed

The `contracts/` directory shipped alongside this plan **is** the Phase 0
deliverable: envelope, ledger, event-stream, SDK, and transport contracts are
fully specified with pinned defaults (JSON / SHA-256 / Ed25519 / HTTP+SSE),
exact field names, exact event/error strings, ports, endpoints, agent IDs, and
scripted demo-agent behavior. `contracts/README.md` contains the revised
30-minute kickoff agenda: instead of *deciding* contracts, the team spends
Phase 0 **ratifying** them (10-minute swap window), setting up the repo and
branches, and smoke-testing the seams (A commits a first registry, B serves a
stub SSE event, C receives it). All deadlines, fixture schedules, and member
briefs in §13 remain unchanged and now reference concrete files.
