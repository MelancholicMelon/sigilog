// SSE event bus per contracts/events.schema.md §1. One emit() stamps a
// monotonically increasing stream_seq and fans the JSON object out to every
// connected /events client.
'use strict';

const { nowIso } = require('./canonical');

class EventBus {
  constructor() {
    this.clients = new Set(); // Express res objects
    this.streamSeq = 0;
  }

  // Register an SSE client (an Express Response already primed with SSE headers).
  addClient(res) {
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  // kind: one of ledger_record | envelope_meta | relay_status | audit_progress
  //       | audit_result | replay_event  (events.schema.md §2)
  emit(kind, data) {
    const event = {
      stream_seq: ++this.streamSeq,
      kind,
      timestamp: nowIso(),
      data,
    };
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) res.write(line);
    return event;
  }
}

module.exports = { EventBus };
