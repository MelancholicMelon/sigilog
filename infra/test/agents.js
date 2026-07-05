// TEST-ONLY stand-in for Member A's protocol/SDK. Exists so B's infra can be
// exercised end-to-end before A's real fixtures/runner arrive (team mode). It
// builds and signs envelopes byte-for-byte per contracts/envelope.schema.md §2-§4
// using real Ed25519, so the tamper rejection is a GENUINE signature failure.
// NOTE: seal()/open() here are a reversible base64url stand-in, NOT real
// encryption — Member A implements real sealing. Replace this whole file with
// A's SDK at Checkpoint 1.
'use strict';

const crypto = require('crypto');
const nacl = require('tweetnacl');
const { canonicalize, sha256hex, nowIso } = require('../lib/canonical');

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4), 'base64');

function makeIdentity(agent_id, role, org) {
  const kp = nacl.sign.keyPair();
  return { agent_id, role, org, public_key: b64url(kp.publicKey), secretKey: kp.secretKey };
}

function writeRegistry(path, identities) {
  const agents = identities.map(({ agent_id, public_key, role, org }) => ({ agent_id, public_key, role, org }));
  require('fs').writeFileSync(path, JSON.stringify({ agents }, null, 2));
}

// buildEnvelope: content_hash = sha256(canonical(content)) for both modes
// (envelope.schema.md §3 — SEALED hashes the plaintext bytes). signature covers
// {content_hash, header, provenance}.
function buildEnvelope(identity, recipient_ids, message_type, content, parent_hashes = [], seal = false) {
  const header = {
    envelope_id: crypto.randomUUID(),
    protocol_version: '0.1',
    sender_id: identity.agent_id,
    recipient_ids,
    timestamp: nowIso(),
    message_type,
  };
  const provenance = { parent_hashes, hop_history: [identity.agent_id] };
  const content_hash = sha256hex(canonicalize(content));

  let payload;
  if (seal) {
    const ciphertext = b64url(Buffer.from(canonicalize(content), 'utf8')); // stand-in "seal"
    payload = { mode: 'SEALED', ciphertext, seal_info: { recipient_id: recipient_ids[0], scheme: 'driver-stub-b64url' } };
  } else {
    payload = { mode: 'PLAINTEXT', content };
  }

  const signInput = canonicalize({ content_hash, header, provenance });
  const signature = b64url(nacl.sign.detached(Buffer.from(signInput, 'utf8'), identity.secretKey));
  return { header, provenance, payload, content_hash, signature };
}

// open: reverse the stand-in seal and return content (recipient side).
function open(envelope) {
  return JSON.parse(fromB64url(envelope.payload.ciphertext).toString('utf8'));
}

module.exports = { makeIdentity, writeRegistry, buildEnvelope, open, b64url, fromB64url };
