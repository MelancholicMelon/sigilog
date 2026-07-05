// Boots the REAL relay, exercises it over HTTP (happy + tamper flows, an audit
// on a hand-broken ledger, and a replay), captures the live SSE stream, and
// writes contracts fixtures/sample_event_stream.jsonl. This is B's §13.3
// deliverable — a real event stream C's mockfeed mirrors. Runs against a fresh
// runtime (it clears runtime files first), so it is safe to re-run.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const { LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH } = require('../lib/paths');
const { runScenario } = require('./scenario-driver');
const { makeIdentity } = require('./agents');

const FIXTURE = path.resolve(__dirname, '../../contracts/fixtures/sample_event_stream.jsonl');
const BASE = 'http://localhost:8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clearRuntime() {
  for (const p of [LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH]) if (fs.existsSync(p)) fs.unlinkSync(p);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(BASE + '/ledger/head');
      return;
    } catch { await sleep(100); }
  }
  throw new Error('server did not come up');
}

function connectSSE(events) {
  return new Promise((resolve) => {
    http.get(BASE + '/events', (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
          }
        }
      });
      resolve();
    });
  });
}

const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

(async () => {
  clearRuntime();
  const server = spawn('node', [path.resolve(__dirname, '../relay/server.js')], { stdio: 'inherit' });
  try {
    await waitForServer();
    const events = [];
    await connectSSE(events);
    await sleep(100);

    const ids = [
      makeIdentity('intake-agent', 'Loan intake', 'Demo Bank'),
      makeIdentity('risk-agent', 'Risk scoring', 'Demo Bank'),
      makeIdentity('compliance-agent', 'Compliance', 'Demo Bank'),
      makeIdentity('decision-agent', 'Decisioning', 'Demo Bank'),
    ];

    // Happy path (full chain to DECISION), then tamper path (VERIFICATION_FAILED).
    await runScenario({ baseUrl: BASE, identities: ids, tamper: false });
    await runScenario({ baseUrl: BASE, identities: ids, tamper: true });
    await sleep(150);

    // Audit of the honest ledger (expect CHAIN_OK), then break a record and re-audit.
    await post('/audit/run', {});
    await sleep(600);

    const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter((l) => l.trim());
    const broken = lines.map((l) => {
      const r = JSON.parse(l);
      if (r.sequence_number === 3) r.actor_id = 'attacker'; // content edited, hash left stale
      return JSON.stringify(r);
    });
    fs.writeFileSync(LEDGER_PATH, broken.join('\n') + '\n');
    await post('/audit/run', {});
    await sleep(600);

    // A short replay so the fixture includes replay_event.
    await post('/replay', { from: 0, to: 5, speed: 8 });
    await sleep(1200);

    // ---- Write and validate the fixture ----
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, events.map((e) => JSON.stringify(e)).join('\n') + '\n');

    const kinds = new Set(events.map((e) => e.kind));
    const eventTypes = new Set(events.filter((e) => e.kind === 'ledger_record').map((e) => e.data.event_type));
    const need = ['ledger_record', 'envelope_meta', 'relay_status', 'audit_progress', 'audit_result', 'replay_event'];
    const missing = need.filter((k) => !kinds.has(k));
    const hasFail = eventTypes.has('VERIFICATION_FAILED');
    const hasBreak = events.some((e) => e.kind === 'audit_result' && e.data.chain === 'CHAIN_BROKEN_AT');

    console.log(`\n[fixture] ${events.length} events -> ${FIXTURE}`);
    console.log('[fixture] kinds:', [...kinds].join(', '));
    console.log('[fixture] ledger event_types:', [...eventTypes].join(', '));
    const ok = events.length >= 20 && missing.length === 0 && hasFail && hasBreak;
    console.log(`[fixture] >=20 lines: ${events.length >= 20} | all kinds: ${missing.length === 0} | VERIFICATION_FAILED: ${hasFail} | audit break: ${hasBreak}`);
    if (!ok) { console.error('[fixture] FAIL — missing:', missing, { hasFail, hasBreak }); process.exitCode = 1; }
    else console.log('[fixture] OK');
  } finally {
    server.kill();
  }
})();
