import { useEffect } from 'react'
import { getFeedMode } from '../config'
import { connectRealFeed } from './realfeed'
import { devRegister } from './actions'

// Boots the event source once on mount. Real mode opens B's SSE stream; mock
// mode seeds REGISTERED rows so the graph has identities immediately.
//
// StrictMode dev double-invoke does mount → cleanup → mount. The real path must
// go through connectRealFeed on the SECOND mount too, or the first mount's
// cleanup closes the only EventSource and nothing reconnects (live stream dies;
// only the one-time backfill lands). So we do NOT guard the real path — its
// cleanup closes the stream and the remount reopens it (backfill re-runs, but
// ledger_record dedup by record_id makes that idempotent). The guard exists
// only to stop mock mode double-seeding REGISTERED rows, which has no cleanup.
let mockSeeded = false

export function useFeed() {
  useEffect(() => {
    if (getFeedMode() === 'real') {
      return connectRealFeed()
    }
    if (mockSeeded) return
    mockSeeded = true
    devRegister()
  }, [])
}
