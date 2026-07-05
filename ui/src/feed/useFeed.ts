import { useEffect } from 'react'
import { getFeedMode } from '../config'
import { connectRealFeed } from './realfeed'
import { devRegister } from './actions'

// Boots the event source once on mount. Real mode opens B's SSE stream; mock
// mode seeds REGISTERED rows so the graph has identities immediately.
// Module-level guard: React StrictMode double-invokes effects in dev, which
// would otherwise register agents / open the stream twice.
let booted = false

export function useFeed() {
  useEffect(() => {
    if (booted) return
    booted = true
    if (getFeedMode() === 'real') {
      return connectRealFeed()
    }
    devRegister()
  }, [])
}
