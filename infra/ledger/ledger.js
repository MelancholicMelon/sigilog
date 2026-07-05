// Append-only, hash-chained ledger per contracts/ledger.schema.md.
// Storage is a single JSONL file (one record per line) so the historical-tamper
// demo is literally "open the file, edit a line, run the auditor".
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { recordHash, envelopeHash, nowIso } = require('../lib/canonical');

const GENESIS_PREV = '0'.repeat(64);

class Ledger {
  // bus is optional (auditor loads a Ledger with no bus). When present, every
  // append emits a `ledger_record` event.
  constructor(ledgerPath, envelopesPath, bus = null) {
    this.ledgerPath = ledgerPath;
    this.envelopesPath = envelopesPath;
    this.bus = bus;
    this.records = [];
    this.envelopes = new Map(); // envelope_hash -> envelope

    this._loadEnvelopes();
    this._loadLedger();
  }

  _loadEnvelopes() {
    if (!fs.existsSync(this.envelopesPath)) return;
    for (const line of fs.readFileSync(this.envelopesPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const { envelope_hash, envelope } = JSON.parse(line);
      this.envelopes.set(envelope_hash, envelope);
    }
  }

  _loadLedger() {
    if (fs.existsSync(this.ledgerPath) && fs.readFileSync(this.ledgerPath, 'utf8').trim()) {
      for (const line of fs.readFileSync(this.ledgerPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        this.records.push(JSON.parse(line));
      }
      return;
    }
    // Fresh ledger: write the genesis record.
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.writeFileSync(this.ledgerPath, '');
    this._writeRecord({
      sequence_number: 0,
      event_type: 'REGISTERED',
      envelope_id: '',
      envelope_hash: '',
      actor_id: 'relay',
      detail: { note: 'genesis' },
      prev_record_hash: GENESIS_PREV,
    });
  }

  get head() {
    return this.records[this.records.length - 1];
  }

  // Low-level: finalize the hash and persist. `partial` has everything except
  // record_id, timestamp, and record_hash (and prev is expected to be set).
  _writeRecord(partial) {
    const withoutHash = {
      sequence_number: partial.sequence_number,
      record_id: crypto.randomUUID(),
      timestamp: nowIso(),
      event_type: partial.event_type,
      envelope_id: partial.envelope_id,
      envelope_hash: partial.envelope_hash,
      actor_id: partial.actor_id,
      detail: partial.detail || {},
      prev_record_hash: partial.prev_record_hash,
    };
    const record = { ...withoutHash, record_hash: recordHash(withoutHash) };
    this.records.push(record);
    fs.appendFileSync(this.ledgerPath, JSON.stringify(record) + '\n');
    if (this.bus) this.bus.emit('ledger_record', record);
    return record;
  }

  // Public append: caller supplies event_type + envelope_id/hash + actor + detail.
  // Sequence number and chain linkage are managed here.
  append({ event_type, envelope_id = '', envelope_hash = '', actor_id, detail = {} }) {
    return this._writeRecord({
      sequence_number: this.head.sequence_number + 1,
      event_type,
      envelope_id,
      envelope_hash,
      actor_id,
      detail,
      prev_record_hash: this.head.record_hash,
    });
  }

  // Persist a full envelope so the auditor can re-verify its signature later.
  // Returns the envelope_hash it was keyed under.
  storeEnvelope(envelope) {
    const hash = envelopeHash(envelope);
    if (!this.envelopes.has(hash)) {
      this.envelopes.set(hash, envelope);
      fs.appendFileSync(this.envelopesPath, JSON.stringify({ envelope_hash: hash, envelope }) + '\n');
    }
    return hash;
  }

  getEnvelope(hash) {
    return this.envelopes.get(hash) || null;
  }

  // ---- Read APIs (ledger.schema.md §5) ----
  range(from = 0, to = null) {
    const hi = to == null ? Infinity : to;
    return this.records.filter((r) => r.sequence_number >= from && r.sequence_number <= hi);
  }

  exists(envelopeHashStr) {
    return this.envelopes.has(envelopeHashStr);
  }
}

module.exports = { Ledger, GENESIS_PREV };
