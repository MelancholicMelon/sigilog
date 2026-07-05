// realfeed — connects to B's live SSE stream and pipes every event through the
// same applyEvent pipeline the mockfeed uses. Enabled with ?feed=real.
// contracts/events.schema.md §1: GET :8080/events, each `data:` line is one
// JSON { stream_seq, kind, timestamp, data }.

import { RELAY_BASE } from '../config'
import { applyEvent } from '../store'
import type { LedgerRecord, StreamEvent } from '../types'

let es: EventSource | null = null

export function connectRealFeed(): () => void {
  es = new EventSource(`${RELAY_BASE}/events`)
  es.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data) as StreamEvent
      applyEvent(evt)
    } catch (err) {
      console.error('bad SSE payload', err, e.data)
    }
  }
  es.onerror = (err) => {
    // EventSource auto-reconnects; stream_seq gaps are detectable by the store.
    console.warn('SSE error (will retry)', err)
  }
  // Backfill history. B's SSE bus only carries events emitted after we connect
  // (no replay to late subscribers), so a mid-run connect or page refresh would
  // otherwise show a blank ledger until the next event. GET /ledger/records
  // returns the full chain; we replay it through the same pipeline as
  // { backfill: true } (no live animation). Ordering is race-free: the stream
  // is already open, and ledger_record dedup (by record_id) makes any overlap
  // between backfill and live events idempotent.
  void backfillLedger()
  return () => {
    es?.close()
    es = null
  }
}

async function backfillLedger(): Promise<void> {
  try {
    const res = await fetch(`${RELAY_BASE}/ledger/records`)
    if (!res.ok) return
    const records = (await res.json()) as LedgerRecord[]
    for (const rec of records) {
      applyEvent(
        {
          stream_seq: rec.sequence_number,
          kind: 'ledger_record',
          timestamp: rec.timestamp,
          data: rec,
        },
        { backfill: true },
      )
    }
  } catch (err) {
    console.warn('ledger backfill failed', err)
  }
}
