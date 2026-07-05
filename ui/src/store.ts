// The event store: a plain external store both mockfeed and the real SSE
// stream feed through ONE pipeline (applyEvent). React reads it via
// useSyncExternalStore (see useStore.ts). Everything rendered is a projection
// of this state.

import type {
  AuditResultData,
  EnvelopeMeta,
  LedgerRecord,
  StreamEvent,
} from './types'

export interface StoreState {
  // Ledger rows, kept sorted by sequence_number.
  records: LedgerRecord[]
  // Dual index (advisor): byId joins ledger<->envelope; byHash resolves
  // parent_hashes (which are envelope_hashes) for the provenance walk.
  envById: Record<string, EnvelopeMeta>
  envByHash: Record<string, EnvelopeMeta>
  maliciousMode: boolean
  audit: { checked: number; total: number; result: AuditResultData | null }
  // True while a replay is streaming, so the UI can show the replay banner.
  replaying: boolean
  // Animation signal. Bumped on every SENT/DELIVERED/VERIFICATION_FAILED (live
  // OR replay). The graph animates off activitySeq so replayed events (same
  // record_id, deduped from `records`) still re-animate.
  activitySeq: number
  lastActivity: { activitySeq: number; record: LedgerRecord; replay: boolean } | null
}

function emptyState(): StoreState {
  return {
    records: [],
    envById: {},
    envByHash: {},
    maliciousMode: false,
    audit: { checked: 0, total: 0, result: null },
    replaying: false,
    activitySeq: 0,
    lastActivity: null,
  }
}

let state: StoreState = emptyState()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getState(): StoreState {
  return state
}

export function resetStore() {
  state = emptyState()
  emit()
}

// THE pipeline. Both live SSE and mockfeed call this. Replay events unwrap to
// their inner ledger_record and re-enter here with { replay: true }. History
// fetched on (re)connect re-enters with { backfill: true } so prior rows land
// without re-firing the live-activity animation.
export function applyEvent(
  evt: StreamEvent,
  opts: { replay?: boolean; backfill?: boolean } = {},
) {
  switch (evt.kind) {
    case 'ledger_record': {
      const rec = evt.data
      // Append keeping sequence order; skip appending exact duplicates (a
      // replayed record already lives in `records`) but STILL fire the
      // animation signal so replay re-animates.
      const isDup = state.records.some((r) => r.record_id === rec.record_id)
      const records = isDup
        ? state.records
        : [...state.records, rec].sort((a, b) => a.sequence_number - b.sequence_number)
      let { activitySeq, lastActivity } = state
      if (
        !opts.backfill &&
        (rec.event_type === 'SENT' ||
          rec.event_type === 'DELIVERED' ||
          rec.event_type === 'VERIFICATION_FAILED')
      ) {
        activitySeq += 1
        lastActivity = { activitySeq, record: rec, replay: !!opts.replay }
      }
      state = { ...state, records, activitySeq, lastActivity }
      break
    }
    case 'envelope_meta': {
      const m = evt.data
      state = {
        ...state,
        envById: { ...state.envById, [m.envelope_id]: m },
        envByHash: { ...state.envByHash, [m.envelope_hash]: m },
      }
      break
    }
    case 'relay_status': {
      state = { ...state, maliciousMode: evt.data.malicious_mode }
      break
    }
    case 'audit_progress': {
      state = {
        ...state,
        audit: { ...state.audit, checked: evt.data.checked, total: evt.data.total },
      }
      break
    }
    case 'audit_result': {
      state = { ...state, audit: { ...state.audit, result: evt.data } }
      break
    }
    case 'replay_event': {
      // Unwrap and re-run through the same pipeline, flagged as replay.
      state = { ...state, replaying: true }
      applyEvent(evt.data.original, { replay: true })
      return // applyEvent above already emitted
    }
  }
  emit()
}

// Mark replay finished (mockfeed / real stream signals end-of-replay).
export function setReplaying(v: boolean) {
  state = { ...state, replaying: v }
  emit()
}

// Provenance walk: given an envelope_id, return its ancestry chain (parents
// resolved by envelope_hash via envByHash) as a flat de-duped list, roots last.
export function ancestryOf(envelopeId: string): EnvelopeMeta[] {
  const start = state.envById[envelopeId]
  if (!start) return []
  const out: EnvelopeMeta[] = []
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const node = stack.shift()!
    if (seen.has(node.envelope_hash)) continue
    seen.add(node.envelope_hash)
    out.push(node)
    for (const ph of node.parent_hashes) {
      const parent = state.envByHash[ph]
      if (parent) stack.push(parent)
    }
  }
  return out
}
