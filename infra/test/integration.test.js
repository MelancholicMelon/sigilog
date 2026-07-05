// Deterministic checkpoint-gate test for B's core: hash chain, envelope store,
// standalone auditor (chain + signature), the in-flight tamper (real sig break),
// the historical tamper (hand-edit -> chain break), and replay emission.
// No server, no network — runs in a temp dir.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const { Ledger } = require('../ledger/ledger');
const { runAudit, verifySignature } = require('../auditor/auditor');
const { runReplay } = require('../replay/replay');
const { tamper } = require('../relay/tamper');
const { makeIdentity, writeRegistry, buildEnvelope } = require('./agents');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attest-'));
const ledgerPath = path.join(dir, 'ledger.jsonl');
const envelopesPath = path.join(dir, 'envelopes.jsonl');
const registryPath = path.join(dir, 'registry.json');

(async () => {
  const risk = makeIdentity('risk-agent', 'Risk scoring', 'Demo Bank');
  writeRegistry(registryPath, [risk]);
  const registry = { 'risk-agent': risk.public_key };

  // Build a real signed envelope and drive it through the ledger.
  const env = buildEnvelope(risk, ['compliance-agent'], 'RISK_ASSESSMENT', { risk: 'HIGH', score: 0.87 });
  const ledger = new Ledger(ledgerPath, envelopesPath, null);
  const hash = ledger.storeEnvelope(env);
  ledger.append({ event_type: 'SENT', envelope_id: env.header.envelope_id, envelope_hash: hash, actor_id: 'risk-agent' });
  ledger.append({ event_type: 'VERIFIED', envelope_id: env.header.envelope_id, envelope_hash: hash, actor_id: 'compliance-agent' });

  // 1. Clean audit
  let r = await runAudit(ledgerPath, envelopesPath, registryPath, null);
  assert.strictEqual(r.chain, 'CHAIN_OK', 'clean ledger should verify');
  assert.strictEqual(r.broken_at_seq, null);
  assert.strictEqual(r.signatures_ok, 1, 'the one SENT envelope signature should verify');
  assert.strictEqual(r.signatures_failed, 0);
  console.log('  ✓ clean audit: CHAIN_OK, 1 signature verified');

  // 2. In-flight tamper breaks the signature (ERR_SIG_INVALID path)
  assert.strictEqual(verifySignature(env, registry), true, 'original sig valid');
  const tampered = tamper(env);
  assert.strictEqual(tampered.payload.content.risk, 'LOW', 'tamper flips HIGH->LOW');
  assert.strictEqual(verifySignature(tampered, registry), false, 'tampered sig must fail -> ERR_SIG_INVALID');
  console.log('  ✓ in-flight tamper: HIGH→LOW, signature verification fails');

  // 3. Historical tamper: hand-edit the SENT record (seq 1), keep its record_hash
  const lines = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter((l) => l.trim());
  const edited = lines.map((l) => {
    const rec = JSON.parse(l);
    if (rec.sequence_number === 1) rec.actor_id = 'attacker'; // content changed, hash left stale
    return JSON.stringify(rec);
  });
  fs.writeFileSync(ledgerPath, edited.join('\n') + '\n');
  r = await runAudit(ledgerPath, envelopesPath, registryPath, null);
  assert.strictEqual(r.chain, 'CHAIN_BROKEN_AT', 'edited ledger should break');
  assert.strictEqual(r.broken_at_seq, 1, 'break pinpointed at the edited record');
  console.log('  ✓ historical tamper: CHAIN_BROKEN_AT seq 1 (exact)');

  // 4. Replay emits one replay_event per record
  const fakeBus = { emit: (kind, data) => fakeBus.events.push({ kind, data }), events: [], streamSeq: 0 };
  const freshLedger = new Ledger(path.join(dir, 'l2.jsonl'), path.join(dir, 'e2.jsonl'), null);
  freshLedger.append({ event_type: 'SENT', actor_id: 'risk-agent' });
  await runReplay(freshLedger, fakeBus, { from: 0, to: null, speed: 100 });
  assert.strictEqual(fakeBus.events.length, freshLedger.records.length, 'one replay_event per record');
  assert.ok(fakeBus.events.every((e) => e.kind === 'replay_event'));
  console.log(`  ✓ replay: ${fakeBus.events.length} replay_event(s) emitted`);

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nintegration.test.js — ALL PASS');
})().catch((e) => {
  console.error('\nintegration.test.js — FAIL\n', e);
  process.exit(1);
});
