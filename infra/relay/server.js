// Relay + ledger + event stream + control API. The single :8080 service B owns
// (contracts/transport.md §2). Deliberately "dumb": it validates envelope SHAPE
// only (never signatures — that is the recipient SDK's job), routes envelopes to
// inboxes, and fans every event out to the UI over SSE.
'use strict';

const fs = require('fs');
const express = require('express');
const cors = require('cors');

const { PORT, UI_ORIGIN, REPO_ROOT, LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH } = require('../lib/paths');
const { envelopeHash } = require('../lib/canonical');
const { EventBus } = require('../lib/bus');
const { Ledger } = require('../ledger/ledger');
const { tamper } = require('./tamper');
const { runAudit } = require('../auditor/auditor');
const { runReplay } = require('../replay/replay');

const bus = new EventBus();
const ledger = new Ledger(LEDGER_PATH, ENVELOPES_PATH, bus);
const inboxes = new Map(); // agent_id -> [envelope, ...]
let maliciousArmed = false;

// Lazy REGISTERED: the contract lists the event type but pins no registration
// endpoint, so the relay records an agent the first time it sends. Seeded from
// the existing ledger so restarts don't duplicate. (Flag for Checkpoint 1.)
const registeredAgents = new Set(
  ledger.records.filter((r) => r.event_type === 'REGISTERED' && r.actor_id !== 'relay').map((r) => r.actor_id)
);
function maybeRegister(agentId) {
  if (registeredAgents.has(agentId)) return;
  registeredAgents.add(agentId);
  let detail = {};
  try {
    if (fs.existsSync(REGISTRY_PATH)) {
      const a = (JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')).agents || []).find((x) => x.agent_id === agentId);
      if (a) detail = { role: a.role, org: a.org };
    }
  } catch { /* registry not written yet */ }
  ledger.append({ event_type: 'REGISTERED', actor_id: agentId, detail });
}

const app = express();
app.use(cors({ origin: UI_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

// ---- Shape validation (NOT signature — transport.md §2) ----
function malformed(env) {
  if (!env || typeof env !== 'object') return true;
  const h = env.header;
  if (!h || !h.envelope_id || !h.sender_id || !Array.isArray(h.recipient_ids) || !h.message_type) return true;
  if (!env.provenance || !Array.isArray(env.provenance.parent_hashes)) return true;
  if (!env.payload || !env.payload.mode) return true;
  if (typeof env.content_hash !== 'string' || typeof env.signature !== 'string') return true;
  return false;
}

function payloadPreview(env) {
  if (env.payload.mode === 'SEALED') {
    const ct = String(env.payload.ciphertext || '');
    return `🔒 ${Math.floor((ct.length * 3) / 4)} bytes ciphertext`;
  }
  const c = env.payload.content;
  const s =
    c && typeof c === 'object'
      ? Object.entries(c)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      : String(c);
  return s.length > 80 ? s.slice(0, 79) + '…' : s;
}

// ---- Live event stream (events.schema.md §1) ----
app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  bus.addClient(res);
  // Tell the (all) clients the current mode so a fresh UI knows the toggle state.
  bus.emit('relay_status', { malicious_mode: maliciousArmed });
});

// ---- Agent-facing endpoints ----
app.post('/send', (req, res) => {
  const env = req.body;
  if (malformed(env)) return res.status(400).json({ ok: false, error: 'malformed' });

  maybeRegister(env.header.sender_id);
  const origHash = ledger.storeEnvelope(env); // persist the ORIGINAL for the auditor
  bus.emit('envelope_meta', {
    envelope_id: env.header.envelope_id,
    envelope_hash: origHash,
    sender_id: env.header.sender_id,
    recipient_ids: env.header.recipient_ids,
    message_type: env.header.message_type,
    payload_mode: env.payload.mode,
    payload_preview: payloadPreview(env),
    parent_hashes: env.provenance.parent_hashes,
  });
  ledger.append({
    event_type: 'SENT',
    envelope_id: env.header.envelope_id,
    envelope_hash: origHash,
    actor_id: env.header.sender_id,
  });

  // Route. If armed, corrupt the copy that reaches the recipient (in flight);
  // the stored original + SENT record stay honest, so the divergence is visible.
  let forwarded = env;
  if (maliciousArmed) {
    forwarded = tamper(env);
    maliciousArmed = false;
    bus.emit('relay_status', { malicious_mode: false });
  }
  for (const rid of env.header.recipient_ids) {
    if (!inboxes.has(rid)) inboxes.set(rid, []);
    inboxes.get(rid).push(forwarded);
  }
  res.json({ ok: true, envelope_hash: origHash });
});

app.get('/inbox/:agentId', (req, res) => {
  const q = inboxes.get(req.params.agentId) || [];
  inboxes.set(req.params.agentId, []);
  for (const env of q) {
    ledger.append({
      event_type: 'DELIVERED',
      envelope_id: env.header.envelope_id,
      envelope_hash: envelopeHash(env), // hash of what was actually delivered
      actor_id: req.params.agentId,
    });
  }
  res.json(q);
});

app.post('/verified', (req, res) => {
  const { envelope_id, envelope_hash = '', checked_by } = req.body;
  ledger.append({ event_type: 'VERIFIED', envelope_id, envelope_hash, actor_id: checked_by });
  res.json({ ok: true });
});

app.post('/verification_failed', (req, res) => {
  const { envelope_id, envelope_hash = '', error_code, checked_by } = req.body;
  ledger.append({
    event_type: 'VERIFICATION_FAILED',
    envelope_id,
    envelope_hash,
    actor_id: checked_by,
    detail: { error_code, checked_by },
  });
  res.json({ ok: true });
});

app.post('/opened', (req, res) => {
  const { envelope_id, envelope_hash = '', actor_id } = req.body;
  ledger.append({ event_type: 'OPENED', envelope_id, envelope_hash, actor_id });
  res.json({ ok: true });
});

// ---- Ledger reads (ledger.schema.md §5) ----
app.get('/ledger/records', (req, res) => {
  const from = req.query.from != null ? Number(req.query.from) : 0;
  const to = req.query.to != null ? Number(req.query.to) : null;
  res.json(ledger.range(from, to));
});
app.get('/ledger/exists/:hash', (req, res) => res.json({ exists: ledger.exists(req.params.hash) }));
app.get('/ledger/head', (req, res) => res.json(ledger.head));

// ---- Control endpoints (events.schema.md §3) ----
app.post('/relay/malicious', (req, res) => {
  maliciousArmed = !!req.body.enabled;
  bus.emit('relay_status', { malicious_mode: maliciousArmed });
  res.json({ ok: true });
});

app.post('/audit/run', (req, res) => {
  runAudit(LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH, bus).catch((e) => console.error('[audit]', e));
  res.json({ ok: true });
});

app.post('/replay', (req, res) => {
  const { from = 0, to = null, speed = 4 } = req.body || {};
  runReplay(ledger, bus, { from, to, speed }).catch((e) => console.error('[replay]', e));
  res.json({ ok: true });
});

// Scenario kickoff forwards to A's runner (transport.md §5). Wiring agreed with
// A at Checkpoint 1: run the Python runner from the repo root. AGENT_RUNNER_CMD
// overrides the command; cwd is always REPO_ROOT so relative paths resolve
// regardless of where the relay was launched from (e.g. `npm start` in infra/).
app.post('/scenario/start', (req, res) => {
  const cmd = process.env.AGENT_RUNNER_CMD || 'python protocol/agents/runner.py start';
  require('child_process').exec(cmd, { cwd: REPO_ROOT }, (err) => {
    if (err) console.error('[scenario] runner failed:', err.message);
  });
  res.json({ ok: true });
});

app.get('/registry', (req, res) => {
  if (!fs.existsSync(REGISTRY_PATH)) return res.json({ agents: [] });
  res.type('application/json').send(fs.readFileSync(REGISTRY_PATH, 'utf8'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[relay] listening on http://localhost:${PORT}`);
    bus.emit('relay_status', { malicious_mode: maliciousArmed });
  });
}

module.exports = { app, bus, ledger };
