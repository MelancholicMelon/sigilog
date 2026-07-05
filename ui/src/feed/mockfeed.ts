// mockfeed — schema-exact fake event emitter (deleted/disabled at Checkpoint 2).
// Mirrors contracts/events.schema.md and the scripted scenario in sdk.api.md §3.
// Feeds the SAME store pipeline (applyEvent) the real SSE stream uses, so the
// 2:45 swap to B's stream is just changing the event *source*, not the renderer.
//
// Timing is intentionally spaced (~600ms) so the graph animates rather than
// dumping all events at once.

import { applyEvent, setReplaying } from '../store'
import type {
  EnvelopeMeta,
  ErrorCode,
  LedgerEventType,
  LedgerRecord,
  MessageType,
  StreamEvent,
} from '../types'

const ZERO_HASH = '0'.repeat(64)
const HEX = '0123456789abcdef'

function fakeHash(): string {
  let s = ''
  for (let i = 0; i < 64; i++) s += HEX[Math.floor(Math.random() * 16)]
  return s
}
function uuid(): string {
  return crypto.randomUUID()
}
function nowIso(): string {
  return new Date().toISOString()
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// --- emitter state ---
let streamSeq = 1
let ledgerSeq = 0
let prevRecordHash = ZERO_HASH
let running = false

function emit(evt: Omit<StreamEvent, 'stream_seq' | 'timestamp'>) {
  applyEvent({ ...evt, stream_seq: streamSeq++, timestamp: nowIso() } as StreamEvent)
}

function ledger(
  event_type: LedgerEventType,
  envelope_id: string,
  envelope_hash: string,
  actor_id: string,
  detail: LedgerRecord['detail'] = {},
) {
  const rec: LedgerRecord = {
    sequence_number: ledgerSeq++,
    record_id: uuid(),
    timestamp: nowIso(),
    event_type,
    envelope_id,
    envelope_hash,
    actor_id,
    detail,
    prev_record_hash: prevRecordHash,
    record_hash: fakeHash(),
  }
  prevRecordHash = rec.record_hash
  emit({ kind: 'ledger_record', data: rec })
}

function meta(m: EnvelopeMeta) {
  emit({ kind: 'envelope_meta', data: m })
}

interface SendSpec {
  sender: string
  recipient: string
  type: MessageType
  mode: 'PLAINTEXT' | 'SEALED'
  preview: string // for SEALED must be the 🔒 form (no plaintext)
  parents: string[]
}

// Emits envelope_meta + SENT, returns the new envelope's id/hash.
function send(spec: SendSpec) {
  const envelope_id = uuid()
  const envelope_hash = fakeHash()
  meta({
    envelope_id,
    envelope_hash,
    sender_id: spec.sender,
    recipient_ids: [spec.recipient],
    message_type: spec.type,
    payload_mode: spec.mode,
    payload_preview: spec.preview,
    parent_hashes: spec.parents,
  })
  ledger('SENT', envelope_id, envelope_hash, 'relay')
  return { envelope_id, envelope_hash }
}

// --- public controls (Controls.tsx calls these in mock mode) ---

export function mockRegisterAgents() {
  // Genesis + per-agent registration. actor relay for genesis.
  ledger('REGISTERED', ZERO_HASH, ZERO_HASH, 'relay')
  for (const id of [
    'intake-agent',
    'risk-agent',
    'compliance-agent',
    'decision-agent',
  ]) {
    ledger('REGISTERED', ZERO_HASH, ZERO_HASH, id)
  }
}

export function mockToggleMalicious(enabled: boolean) {
  emit({ kind: 'relay_status', data: { malicious_mode: enabled } })
}

// The full happy-path loan flow (all green ✅).
export async function mockScenarioHappy() {
  if (running) return
  running = true
  try {
    // 1. intake -> risk : LOAN_APPLICATION (SEALED)  — preview hides plaintext.
    const app = send({
      sender: 'intake-agent',
      recipient: 'risk-agent',
      type: 'LOAN_APPLICATION',
      mode: 'SEALED',
      preview: '🔒 128 bytes ciphertext',
      parents: [],
    })
    await sleep(600)
    ledger('DELIVERED', app.envelope_id, app.envelope_hash, 'relay')
    await sleep(500)
    ledger('VERIFIED', app.envelope_id, app.envelope_hash, 'risk-agent')
    await sleep(400)
    ledger('OPENED', app.envelope_id, app.envelope_hash, 'risk-agent')
    await sleep(600)

    // 2. risk -> compliance : RISK_ASSESSMENT
    const risk = send({
      sender: 'risk-agent',
      recipient: 'compliance-agent',
      type: 'RISK_ASSESSMENT',
      mode: 'PLAINTEXT',
      preview: 'risk=HIGH score=0.87',
      parents: [app.envelope_hash],
    })
    await sleep(600)
    ledger('DELIVERED', risk.envelope_id, risk.envelope_hash, 'relay')
    await sleep(500)
    ledger('VERIFIED', risk.envelope_id, risk.envelope_hash, 'compliance-agent')
    await sleep(600)

    // 3. compliance -> decision : COMPLIANCE_CHECK
    const check = send({
      sender: 'compliance-agent',
      recipient: 'decision-agent',
      type: 'COMPLIANCE_CHECK',
      mode: 'PLAINTEXT',
      preview: 'policy=PASS_WITH_REVIEW',
      parents: [risk.envelope_hash],
    })
    await sleep(600)
    ledger('DELIVERED', check.envelope_id, check.envelope_hash, 'relay')
    await sleep(500)
    ledger('VERIFIED', check.envelope_id, check.envelope_hash, 'decision-agent')
    await sleep(600)

    // 4. decision -> intake : DECISION (parents = check + risk)
    const dec = send({
      sender: 'decision-agent',
      recipient: 'intake-agent',
      type: 'DECISION',
      mode: 'PLAINTEXT',
      preview: 'decision=DENY reason=HIGH risk',
      parents: [check.envelope_hash, risk.envelope_hash],
    })
    await sleep(600)
    ledger('DELIVERED', dec.envelope_id, dec.envelope_hash, 'relay')
    await sleep(500)
    ledger('VERIFIED', dec.envelope_id, dec.envelope_hash, 'intake-agent')
  } finally {
    running = false
  }
}

// The attack path: relay flips HIGH->LOW in flight; compliance rejects with
// ERR_SIG_INVALID and the chain stops. THIS is the red ❌ demo centerpiece.
export async function mockScenarioCorrupt() {
  if (running) return
  running = true
  try {
    mockToggleMalicious(true)
    await sleep(300)

    const app = send({
      sender: 'intake-agent',
      recipient: 'risk-agent',
      type: 'LOAN_APPLICATION',
      mode: 'SEALED',
      preview: '🔒 128 bytes ciphertext',
      parents: [],
    })
    await sleep(600)
    ledger('DELIVERED', app.envelope_id, app.envelope_hash, 'relay')
    await sleep(400)
    ledger('VERIFIED', app.envelope_id, app.envelope_hash, 'risk-agent')
    await sleep(300)
    ledger('OPENED', app.envelope_id, app.envelope_hash, 'risk-agent')
    await sleep(600)

    // risk sends HIGH; relay mutates payload to LOW mid-flight. Preview shows
    // the tampered value; signature no longer matches the signed region.
    const risk = send({
      sender: 'risk-agent',
      recipient: 'compliance-agent',
      type: 'RISK_ASSESSMENT',
      mode: 'PLAINTEXT',
      preview: 'risk=LOW score=0.87  ⚠ mutated in flight',
      parents: [app.envelope_hash],
    })
    await sleep(600)
    ledger('DELIVERED', risk.envelope_id, risk.envelope_hash, 'relay')
    await sleep(500)
    // compliance-agent verify FAILS -> the money shot.
    const detail: LedgerRecord['detail'] = {
      error_code: 'ERR_SIG_INVALID' as ErrorCode,
      checked_by: 'compliance-agent',
    }
    ledger('VERIFICATION_FAILED', risk.envelope_id, risk.envelope_hash, 'compliance-agent', detail)
    // relay auto-disables after mutating one message.
    await sleep(300)
    mockToggleMalicious(false)
  } finally {
    running = false
  }
}

// Auditor run. broken=false -> CHAIN_OK; broken=true -> pinpoints the break
// (models the historical hand-edit demo so the broken-chain UI exists).
export async function mockRunAudit(broken: boolean) {
  const total = Math.max(ledgerSeq, 8)
  for (let checked = 0; checked <= total; checked += Math.ceil(total / 6)) {
    emit({ kind: 'audit_progress', data: { checked: Math.min(checked, total), total } })
    await sleep(180)
  }
  const brokenSeq = Math.max(2, Math.floor(total / 2))
  emit({
    kind: 'audit_result',
    data: broken
      ? {
          chain: 'CHAIN_BROKEN_AT',
          broken_at_seq: brokenSeq,
          signatures_ok: total - 1,
          signatures_failed: 1,
        }
      : {
          chain: 'CHAIN_OK',
          broken_at_seq: null,
          signatures_ok: total,
          signatures_failed: 0,
        },
  })
}

// Replay: re-emit recorded ledger records as replay_event at speed x.
export async function mockReplay(records: LedgerRecord[], speed: number) {
  setReplaying(true)
  const gap = 500 / Math.max(speed, 1)
  for (const rec of records) {
    emit({
      kind: 'replay_event',
      data: {
        original: {
          stream_seq: streamSeq,
          kind: 'ledger_record',
          timestamp: nowIso(),
          data: rec,
        },
        replay_speed: speed,
      },
    })
    await sleep(gap)
  }
  setReplaying(false)
}
