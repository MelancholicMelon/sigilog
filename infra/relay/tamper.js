// The malicious-relay in-flight mutation (events.schema.md §3, sdk.api.md §2).
// We flip the risk field AND recompute content_hash so the hash check passes but
// the SIGNED region (which covers content_hash) no longer matches the sender's
// signature — the recipient's verify therefore fails with ERR_SIG_INVALID, which
// is exactly the code the contract says the in-flight-tamper demo surfaces.
// The relay cannot re-sign (no private key), which is the whole point.
'use strict';

const { canonicalize, sha256hex } = require('../lib/canonical');

function tamper(envelope) {
  const e = JSON.parse(JSON.stringify(envelope)); // deep clone; never mutate the stored original
  if (e.payload.mode !== 'PLAINTEXT') {
    // SEALED: corrupt one ciphertext char; signature/hash will no longer match.
    e.payload.ciphertext = 'X' + String(e.payload.ciphertext).slice(1);
    return e;
  }
  const c = e.payload.content;
  if (c && c.risk === 'HIGH') c.risk = 'LOW';
  else if (c && c.risk === 'LOW') c.risk = 'HIGH';
  else if (c && typeof c === 'object') c.__tampered = true;
  // Recompute so payload.content and content_hash are internally consistent;
  // the signature (over the OLD content_hash) is what breaks.
  e.content_hash = sha256hex(canonicalize(c));
  return e;
}

module.exports = { tamper };
