// Independent auditor (contracts/ledger.schema.md §4). Runs standalone against
// the ledger file + envelope store + registry — it does NOT trust the relay.
//   1. Walk records; recompute every record_hash; check every prev linkage.
//   2. Re-verify every SENT envelope's Ed25519 signature against the registry.
// Emits audit_progress / audit_result on the bus (for C's animation) AND prints
// a machine-readable JSON summary to stdout when run directly.
'use strict';

const fs = require('fs');
const nacl = require('tweetnacl');
const { canonicalize, recordHash } = require('../lib/canonical');
const { GENESIS_PREV } = require('../ledger/ledger');

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4);
  return Buffer.from(b64, 'base64');
}

function loadJsonl(path) {
  if (!fs.existsSync(path)) return [];
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// Re-verify one envelope's signature exactly per envelope.schema.md §4.
function verifySignature(env, registry) {
  const pk = registry[env.header.sender_id];
  if (!pk) return false; // ERR_UNKNOWN_SENDER equivalent
  const signInput = canonicalize({
    content_hash: env.content_hash,
    header: env.header,
    provenance: env.provenance,
  });
  try {
    return nacl.sign.detached.verify(
      Buffer.from(signInput, 'utf8'),
      b64urlToBytes(env.signature),
      b64urlToBytes(pk)
    );
  } catch {
    return false;
  }
}

// bus is optional (null when run standalone). Returns the summary object.
async function runAudit(ledgerPath, envelopesPath, registryPath, bus = null) {
  const records = loadJsonl(ledgerPath).sort((a, b) => a.sequence_number - b.sequence_number);
  const envelopes = new Map(loadJsonl(envelopesPath).map((e) => [e.envelope_hash, e.envelope]));
  const registry = {};
  if (fs.existsSync(registryPath)) {
    for (const a of JSON.parse(fs.readFileSync(registryPath, 'utf8')).agents || []) {
      registry[a.agent_id] = a.public_key;
    }
  }

  let brokenAt = null;
  let signaturesOk = 0;
  let signaturesFailed = 0;
  let prevStoredHash = null;
  const total = records.length;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const expectedPrev = i === 0 ? GENESIS_PREV : prevStoredHash;

    // (a) content integrity: recomputed hash must equal the stored hash
    // (b) linkage: prev_record_hash must equal the previous record's stored hash
    const contentOk = recordHash(rec) === rec.record_hash;
    const linkOk = rec.prev_record_hash === expectedPrev;
    if (brokenAt === null && (!contentOk || !linkOk)) brokenAt = rec.sequence_number;
    prevStoredHash = rec.record_hash;

    if (rec.event_type === 'SENT') {
      const env = envelopes.get(rec.envelope_hash);
      if (env && verifySignature(env, registry)) signaturesOk++;
      else signaturesFailed++;
    }

    if (bus) {
      bus.emit('audit_progress', { checked: i + 1, total });
      await new Promise((r) => setTimeout(r, 25)); // let C animate the sweep
    }
  }

  const summary = {
    chain: brokenAt === null ? 'CHAIN_OK' : 'CHAIN_BROKEN_AT',
    broken_at_seq: brokenAt,
    signatures_ok: signaturesOk,
    signatures_failed: signaturesFailed,
  };
  if (bus) bus.emit('audit_result', summary);
  return summary;
}

module.exports = { runAudit, verifySignature };

if (require.main === module) {
  const { LEDGER_PATH, ENVELOPES_PATH, REGISTRY_PATH } = require('../lib/paths');
  const ledgerArg = process.argv[2] || LEDGER_PATH;
  runAudit(ledgerArg, ENVELOPES_PATH, REGISTRY_PATH, null).then((s) => {
    console.log(JSON.stringify(s, null, 2));
    process.exit(s.chain === 'CHAIN_OK' ? 0 : 1);
  });
}
