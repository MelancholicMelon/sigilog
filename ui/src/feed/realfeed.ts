// realfeed — connects to B's live SSE stream and pipes every event through the
// same applyEvent pipeline the mockfeed uses. Enabled with ?feed=real.
// contracts/events.schema.md §1: GET :8080/events, each `data:` line is one
// JSON { stream_seq, kind, timestamp, data }.

import { RELAY_BASE } from '../config'
import { applyEvent } from '../store'
import type { StreamEvent } from '../types'

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
  return () => {
    es?.close()
    es = null
  }
}
