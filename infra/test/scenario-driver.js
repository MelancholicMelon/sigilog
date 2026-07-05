// TEST-ONLY driver: plays the loan-approval scenario (sdk.api.md §3) through B's
// LIVE relay over HTTP, standing in for A's agent runner until Checkpoint 1.
// Verification is REAL (same Ed25519 check the auditor uses), so with tamper=true
// the compliance-agent genuinely rejects with ERR_SIG_INVALID and the chain stops.
'use strict';

const { REGISTRY_PATH } = require('../lib/paths');
const { canonicalize, sha256hex } = require('../lib/canonical');
const { verifySignature } = require('../auditor/auditor');
const { makeIdentity, writeRegistry, buildEnvelope, open } = require('./agents');

async function runScenario({ baseUrl = 'http://localhost:8080', tamper = false, identities = null } = {}) {
  const ids = identities || [
    makeIdentity('intake-agent', 'Loan intake', 'Demo Bank'),
    makeIdentity('risk-agent', 'Risk scoring', 'Demo Bank'),
    makeIdentity('compliance-agent', 'Compliance', 'Demo Bank'),
    makeIdentity('decision-agent', 'Decisioning', 'Demo Bank'),
  ];
  const [intake, risk, compliance, decision] = ids;
  writeRegistry(REGISTRY_PATH, ids);
  const registry = Object.fromEntries(ids.map((i) => [i.agent_id, i.public_key]));

  const post = (p, body) => fetch(baseUrl + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const get = (p) => fetch(baseUrl + p).then((r) => r.json());

  // Recipient-side verification, returns the SDK error code on failure.
  async function receiveAndVerify(recipientId, checkerIdentity) {
    const envs = await get(`/inbox/${recipientId}`);
    const results = [];
    for (const env of envs) {
      let content = null;
      if (env.payload.mode === 'SEALED') {
        content = open(env);
        await post('/opened', { envelope_id: env.header.envelope_id, envelope_hash: env.content_hash, actor_id: recipientId });
      } else {
        content = env.payload.content;
      }
      let error_code = null;
      if (!registry[env.header.sender_id]) error_code = 'ERR_UNKNOWN_SENDER';
      else if (!verifySignature(env, registry)) error_code = 'ERR_SIG_INVALID';
      else if (sha256hex(canonicalize(content)) !== env.content_hash) error_code = 'ERR_HASH_MISMATCH';
      else {
        for (const ph of env.provenance.parent_hashes) {
          const { exists } = await get(`/ledger/exists/${ph}`);
          if (!exists) { error_code = 'ERR_PARENT_NOT_FOUND'; break; }
        }
      }
      if (error_code) await post('/verification_failed', { envelope_id: env.header.envelope_id, error_code, checked_by: recipientId });
      else await post('/verified', { envelope_id: env.header.envelope_id, checked_by: recipientId });
      results.push({ env, content, ok: !error_code, error_code });
    }
    return results;
  }

  // 1. intake -> risk : LOAN_APPLICATION (SEALED)
  const app = buildEnvelope(intake, ['risk-agent'], 'LOAN_APPLICATION', { name: 'Taro Yamada', income: 5200000, amount: 3000000 }, [], true);
  const appRes = await post('/send', app);
  await receiveAndVerify('risk-agent', risk);

  // 2. risk -> compliance : RISK_ASSESSMENT  (arm the malicious relay first if tampering)
  if (tamper) await post('/relay/malicious', { enabled: true });
  const assess = buildEnvelope(risk, ['compliance-agent'], 'RISK_ASSESSMENT', { risk: 'HIGH', score: 0.87 }, [appRes.envelope_hash]);
  const assessRes = await post('/send', assess);
  const complianceRx = await receiveAndVerify('compliance-agent', compliance);
  if (complianceRx.some((r) => !r.ok)) {
    return { halted: true, at: 'compliance-agent', error_code: complianceRx.find((r) => !r.ok).error_code };
  }

  // 3. compliance -> decision : COMPLIANCE_CHECK
  const check = buildEnvelope(compliance, ['decision-agent'], 'COMPLIANCE_CHECK', { policy: 'PASS_WITH_REVIEW' }, [assessRes.envelope_hash]);
  const checkRes = await post('/send', check);
  await receiveAndVerify('decision-agent', decision);

  // 4. decision -> intake : DECISION
  const dec = buildEnvelope(decision, ['intake-agent'], 'DECISION', { decision: 'DENY', reason: 'HIGH risk' }, [checkRes.envelope_hash, assessRes.envelope_hash]);
  await post('/send', dec);
  await receiveAndVerify('intake-agent', intake);

  return { halted: false };
}

module.exports = { runScenario };

if (require.main === module) {
  const tamper = process.argv.includes('--tamper');
  runScenario({ tamper }).then((r) => console.log('[scenario]', JSON.stringify(r)));
}
