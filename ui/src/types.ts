// Types transcribed verbatim from the frozen contracts. Do not invent fields.
// Sources: contracts/ledger.schema.md §1-2, events.schema.md §2, sdk.api.md §2.

// --- Ledger (ledger.schema.md §2) — exact strings, rendered verbatim ---
export type LedgerEventType =
  | 'REGISTERED'
  | 'SENT'
  | 'DELIVERED'
  | 'VERIFIED'
  | 'OPENED'
  | 'VERIFICATION_FAILED'

// --- Error codes (sdk.api.md §2) — displayed verbatim on the red ❌ ---
export type ErrorCode =
  | 'ERR_UNKNOWN_SENDER'
  | 'ERR_SIG_INVALID'
  | 'ERR_HASH_MISMATCH'
  | 'ERR_PARENT_NOT_FOUND'
  | 'ERR_NOT_RECIPIENT'
  | 'ERR_MALFORMED'

// --- Ledger record (ledger.schema.md §1) ---
export interface LedgerRecord {
  sequence_number: number
  record_id: string
  timestamp: string
  event_type: LedgerEventType
  envelope_id: string
  envelope_hash: string
  actor_id: string
  // For VERIFICATION_FAILED: { error_code, checked_by }.
  detail: {
    error_code?: ErrorCode
    checked_by?: string
    [k: string]: unknown
  }
  prev_record_hash: string
  record_hash: string
}

// --- envelope_meta (events.schema.md §2) — fires alongside SENT ---
export type MessageType =
  | 'LOAN_APPLICATION'
  | 'RISK_ASSESSMENT'
  | 'COMPLIANCE_CHECK'
  | 'DECISION'

export interface EnvelopeMeta {
  envelope_id: string
  envelope_hash: string
  sender_id: string
  recipient_ids: string[]
  message_type: MessageType
  payload_mode: 'PLAINTEXT' | 'SEALED'
  // SEALED preview MUST NOT contain plaintext (events.schema.md §2).
  payload_preview: string
  parent_hashes: string[]
}

// --- SSE event kinds (events.schema.md §2) ---
export type SseKind =
  | 'ledger_record'
  | 'envelope_meta'
  | 'relay_status'
  | 'audit_progress'
  | 'audit_result'
  | 'replay_event'

export interface RelayStatusData {
  malicious_mode: boolean
}
export interface AuditProgressData {
  checked: number
  total: number
}
export interface AuditResultData {
  chain: 'CHAIN_OK' | 'CHAIN_BROKEN_AT'
  broken_at_seq: number | null
  signatures_ok: number
  signatures_failed: number
}

// Discriminated union of the SSE envelope { stream_seq, kind, timestamp, data }.
export type StreamEvent =
  | { stream_seq: number; kind: 'ledger_record'; timestamp: string; data: LedgerRecord }
  | { stream_seq: number; kind: 'envelope_meta'; timestamp: string; data: EnvelopeMeta }
  | { stream_seq: number; kind: 'relay_status'; timestamp: string; data: RelayStatusData }
  | { stream_seq: number; kind: 'audit_progress'; timestamp: string; data: AuditProgressData }
  | { stream_seq: number; kind: 'audit_result'; timestamp: string; data: AuditResultData }
  | { stream_seq: number; kind: 'replay_event'; timestamp: string; data: ReplayEventData }

// replay_event wraps a full ledger_record event object (events.schema.md §2).
export interface ReplayEventData {
  original: Extract<StreamEvent, { kind: 'ledger_record' }>
  replay_speed: number
}
