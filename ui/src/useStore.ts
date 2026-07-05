import { useSyncExternalStore } from 'react'
import { getState, subscribe } from './store'
import type { StoreState } from './store'

// Subscribe React to the external event store. Components re-render whenever
// applyEvent mutates state.
export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getState)
}
