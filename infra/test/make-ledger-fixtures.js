// Generates B's §13.3 ledger fixtures for C (auditor/replay UI) + integration:
//   project-kit/fixtures/sample_ledger.valid.jsonl        — an honest chain
//   project-kit/fixtures/sample_ledger.broken_chain.jsonl — seq 2 hand-edited
// These are CHAIN fixtures: they carry no envelope store / registry, so the
// auditor's signature pass isn't exercised here (that's what the event-stream
// fixture + real fixtures cover). Runs against a fresh runtime, safe to re-run.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH } = require('../lib/paths');
const { runScenario } = require('./scenario-driver');
const { runAudit } = require('../auditor/auditor');

const FIX = path.resolve(__dirname, '../../contracts/fixtures');
const VALID = path.join(FIX, 'sample_ledger.valid.jsonl');
const BROKEN = path.join(FIX, 'sample_ledger.broken_chain.jsonl');
const BROKEN_AT = 2; // the SENT LOAN_APPLICATION record — assert this in tests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clearRuntime() {
  for (const p of [LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH]) if (fs.existsSync(p)) fs.unlinkSync(p);
}
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { await fetch('http://localhost:8080/ledger/head'); return; } catch { await sleep(100); }
  }
  throw new Error('server did not come up');
}

(async () => {
  clearRuntime();
  const server = spawn('node', [path.resolve(__dirname, '../relay/server.js')], { stdio: 'inherit' });
  try {
    await waitForServer();
    await runScenario({ tamper: false }); // one honest happy path
    await sleep(150);
  } finally {
    server.kill();
    await sleep(200);
  }

  fs.mkdirSync(FIX, { recursive: true });
  const lines = fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter((l) => l.trim());
  fs.writeFileSync(VALID, lines.join('\n') + '\n');

  const broken = lines.map((l) => {
    const r = JSON.parse(l);
    if (r.sequence_number === BROKEN_AT) r.actor_id = 'attacker'; // content edited, record_hash left stale
    return JSON.stringify(r);
  });
  fs.writeFileSync(BROKEN, broken.join('\n') + '\n');

  // Self-verify (chain-only: no envelope store / registry passed).
  const v = await runAudit(VALID, '/nonexistent', '/nonexistent', null);
  const b = await runAudit(BROKEN, '/nonexistent', '/nonexistent', null);
  clearRuntime();

  console.log(`[ledger-fixtures] valid  → ${VALID}  chain=${v.chain}`);
  console.log(`[ledger-fixtures] broken → ${BROKEN}  chain=${b.chain} at=${b.broken_at_seq}`);
  const ok = v.chain === 'CHAIN_OK' && b.chain === 'CHAIN_BROKEN_AT' && b.broken_at_seq === BROKEN_AT;
  console.log(ok ? '[ledger-fixtures] OK' : '[ledger-fixtures] FAIL');
  if (!ok) process.exitCode = 1;
})();
