// Canonicalization + hashing per contracts/envelope.schema.md §2-§5 and
// contracts/ledger.schema.md §3. THE interop-critical module — every hash and
// signature in the system flows through canonicalize(). Do not "improve" this
// without a contracts huddle.
'use strict';

const crypto = require('crypto');

// canonical(x): JSON with object keys sorted alphabetically (byte order) at
// every nesting level, no whitespace, UTF-8. JSON.stringify already emits
// compact separators (",", ":") and leaves non-ASCII unescaped, so we only need
// to recursively sort object keys before stringifying.
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
    return out;
  }
  return value;
}

function canonicalize(value) {
  return JSON.stringify(sortValue(value));
}

function sha256hex(utf8String) {
  return crypto.createHash('sha256').update(utf8String, 'utf8').digest('hex');
}

// envelope_hash = sha256_hex(canonical(entire_envelope_including_signature))
function envelopeHash(envelope) {
  return sha256hex(canonicalize(envelope));
}

// record_hash = sha256_hex(canonical(record without the record_hash field)),
// with prev_record_hash INCLUDED in the hashed object.
function recordHash(recordWithoutHash) {
  const { record_hash, ...rest } = recordWithoutHash;
  return sha256hex(canonicalize(rest));
}

// ISO 8601 UTC with milliseconds, e.g. 2026-07-05T09:30:00.000Z
function nowIso() {
  return new Date().toISOString();
}

module.exports = { canonicalize, sha256hex, envelopeHash, recordHash, nowIso };
