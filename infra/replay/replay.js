// Replay (contracts/ledger.schema.md §6). Re-emits recorded ledger records over
// the live stream wrapped as `replay_event` at speed× compressed cadence. The
// UI scrubber is just a client of POST /replay.
'use strict';

async function runReplay(ledger, bus, { from = 0, to = null, speed = 4 }) {
  const records = ledger.range(from, to);
  const interval = Math.max(30, Math.floor(500 / (speed || 1)));
  for (const rec of records) {
    // `original` mimics a live ledger_record event so C renders it through the
    // same pipeline (events.schema.md §2, replay_event).
    const original = {
      stream_seq: rec.sequence_number,
      kind: 'ledger_record',
      timestamp: rec.timestamp,
      data: rec,
    };
    bus.emit('replay_event', { original, replay_speed: speed });
    await new Promise((r) => setTimeout(r, interval));
  }
}

module.exports = { runReplay };
