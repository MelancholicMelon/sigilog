// actions — what the control buttons do. Routes to mockfeed (mock mode) or
// B's HTTP control endpoints (real mode). All control endpoints return
// {ok:true} immediately; results arrive on the stream — so these are
// deliberately fire-and-forget (advisor / events.schema.md §3).

import { RELAY_BASE, getFeedMode } from '../config'
import { getState } from '../store'
import {
  mockRegisterAgents,
  mockReplay,
  mockRunAudit,
  mockScenarioCorrupt,
  mockScenarioHappy,
  mockToggleMalicious,
} from './mockfeed'

// mock-only latches modelling relay arming + a hand-edited (broken) ledger.
let armedCorrupt = false
let ledgerBroken = false

function post(path: string, body: unknown) {
  // fire-and-forget; never await a meaningful result body.
  void fetch(`${RELAY_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).catch((e) => console.warn(`POST ${path} failed`, e))
}

export function runScenario() {
  if (getFeedMode() === 'real') return post('/scenario/start', {})
  // mock: corrupted flow if armed, else happy path.
  if (armedCorrupt) {
    armedCorrupt = false
    void mockScenarioCorrupt()
  } else {
    void mockScenarioHappy()
  }
}

export function corruptNext() {
  if (getFeedMode() === 'real') return post('/relay/malicious', { enabled: true })
  armedCorrupt = true
  mockToggleMalicious(true)
}

export function runAudit() {
  if (getFeedMode() === 'real') return post('/audit/run', {})
  void mockRunAudit(ledgerBroken)
}

export function replay(from: number, to: number | null, speed: number) {
  if (getFeedMode() === 'real') return post('/replay', { from, to, speed })
  const records = getState().records.filter(
    (r) => r.sequence_number >= from && (to == null || r.sequence_number <= to),
  )
  void mockReplay(records, speed)
}

// --- mock-only dev triggers (feed=mock; removed at Checkpoint 2) ---
export function devRegister() {
  mockRegisterAgents()
}
export function devBreakLedger() {
  // Models the historical hand-edit: the NEXT audit will report a break.
  ledgerBroken = true
}
export function isLedgerBroken() {
  return ledgerBroken
}
