// B's checkpoint-gate test (PLAN.md §13.3). Ingests A's golden envelope +
// registry fixtures through B's ledger and auditor. It AUTO-UPGRADES: if A has
// deposited real fixtures it uses them; otherwise it falls back to B's stand-in
// signer so the gate is runnable before Checkpoint 1. Append-only file — other
// members add their own tests here, never edit this one.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const INFRA = path.resolve(__dirname, '../infra');
const FIX = path.resolve(__dirname, '../contracts/fixtures');
const { Ledger } = require(path.join(INFRA, 'ledger/ledger'));
const { runAudit } = require(path.join(INFRA, 'auditor/auditor'));
const { makeIdentity, writeRegistry, buildEnvelope } = require(path.join(INFRA, 'test/agents'));

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const exists = (p) => fs.existsSync(p);

const validPath = path.join(FIX, 'golden_envelope.valid.json');
const forgedPath = path.join(FIX, 'golden_envelope.forged.json');
const registryPath = path.join(FIX, 'sample_registry.json');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attest-int-'));
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  const envelopesPath = path.join(dir, 'envelopes.jsonl');
  let regPath;
  let valid;
  let forged = null;
  let usingRealFixtures = false;

  if (exists(validPath) && exists(registryPath)) {
    usingRealFixtures = true;
    valid = readJson(validPath);
    regPath = registryPath;
    if (exists(forgedPath)) forged = readJson(forgedPath);
    console.log('  · using A\'s real fixtures');
  } else {
    // Fallback stand-in (pre-Checkpoint-1): fabricate a valid + a forged envelope.
    regPath = path.join(dir, 'registry.json');
    const a = makeIdentity('risk-agent', 'Risk', 'Demo Bank');
    writeRegistry(regPath, [a]);
    valid = buildEnvelope(a, ['compliance-agent'], 'RISK_ASSESSMENT', { risk: 'HIGH', score: 0.87 });
    forged = buildEnvelope(a, ['compliance-agent'], 'RISK_ASSESSMENT', { risk: 'HIGH', score: 0.87 });
    forged.signature = 'A' + forged.signature.slice(1); // corrupt the signature
    console.log('  · A\'s fixtures not present — using B stand-in signer');
  }

  const ledger = new Ledger(ledgerPath, envelopesPath, null);
  const vHash = ledger.storeEnvelope(valid);
  ledger.append({ event_type: 'SENT', envelope_id: valid.header.envelope_id, envelope_hash: vHash, actor_id: valid.header.sender_id });

  let r = await runAudit(ledgerPath, envelopesPath, regPath, null);
  assert.strictEqual(r.chain, 'CHAIN_OK', 'chain must verify after ingesting a valid envelope');
  assert.ok(r.signatures_ok >= 1, 'the valid envelope signature must verify');
  assert.strictEqual(r.signatures_failed, 0, 'no signature failures expected on the valid envelope');
  console.log(`  ✓ ingested valid envelope → CHAIN_OK, signatures_ok=${r.signatures_ok}`);

  if (forged) {
    const fHash = ledger.storeEnvelope(forged);
    ledger.append({ event_type: 'SENT', envelope_id: forged.header.envelope_id, envelope_hash: fHash, actor_id: forged.header.sender_id });
    r = await runAudit(ledgerPath, envelopesPath, regPath, null);
    assert.ok(r.signatures_failed >= 1, 'forged envelope signature must be flagged');
    console.log(`  ✓ ingested forged envelope → signatures_failed=${r.signatures_failed}`);
  }

  // B's ledger fixtures (§13.3) — chain-only audit (no envelope store/registry).
  const validLedger = path.join(FIX, 'sample_ledger.valid.jsonl');
  const brokenLedger = path.join(FIX, 'sample_ledger.broken_chain.jsonl');
  if (exists(validLedger) && exists(brokenLedger)) {
    const v = await runAudit(validLedger, '/nonexistent', '/nonexistent', null);
    const b = await runAudit(brokenLedger, '/nonexistent', '/nonexistent', null);
    assert.strictEqual(v.chain, 'CHAIN_OK', 'sample_ledger.valid must verify');
    assert.strictEqual(b.chain, 'CHAIN_BROKEN_AT', 'sample_ledger.broken_chain must break');
    assert.strictEqual(b.broken_at_seq, 2, 'break pinpointed at seq 2');
    console.log(`  ✓ ledger fixtures → valid CHAIN_OK, broken CHAIN_BROKEN_AT seq ${b.broken_at_seq}`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\ninfra_b.test.js — ALL PASS (${usingRealFixtures ? 'real fixtures' : 'stand-in'})`);
})().catch((e) => {
  console.error('\ninfra_b.test.js — FAIL\n', e);
  process.exit(1);
});
