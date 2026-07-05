import { ArrowDownLeft, ArrowUpRight, KeyRound, LockOpen, ShieldCheck, ShieldX } from 'lucide-react'
import { useStore } from '../useStore'
import type { LedgerEventType, LedgerRecord } from '../types'

// Scrolling hash-chained ledger. event_type strings and error codes rendered
// verbatim (ledger.schema.md §2, sdk.api.md §2). Clicking a row selects the
// envelope for the provenance inspector.

const BADGE: Record<LedgerEventType, { Icon: typeof KeyRound; cls: string }> = {
  REGISTERED: { Icon: KeyRound, cls: 'text-zinc-400' },
  SENT: { Icon: ArrowUpRight, cls: 'text-sky-400' },
  DELIVERED: { Icon: ArrowDownLeft, cls: 'text-sky-300' },
  VERIFIED: { Icon: ShieldCheck, cls: 'text-emerald-400' },
  OPENED: { Icon: LockOpen, cls: 'text-amber-300' },
  VERIFICATION_FAILED: { Icon: ShieldX, cls: 'text-red-400' },
}

function shortHash(h: string) {
  return h.slice(0, 8)
}

function Row({
  r,
  selected,
  onSelect,
}: {
  r: LedgerRecord
  selected: boolean
  onSelect: () => void
}) {
  const b = BADGE[r.event_type]
  const failed = r.event_type === 'VERIFICATION_FAILED'
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 border-b border-zinc-800/70 px-2 py-1 text-left font-mono text-[11px] hover:bg-zinc-800/60 ${
        failed ? 'bg-red-950/40' : ''
      } ${selected ? 'ring-1 ring-inset ring-amber-400/70' : ''}`}
    >
      <span className="w-8 shrink-0 text-zinc-600">#{r.sequence_number}</span>
      <b.Icon className={`h-3.5 w-3.5 shrink-0 ${b.cls}`} />
      <span className={`w-40 shrink-0 ${b.cls}`}>{r.event_type}</span>
      <span className="w-28 shrink-0 truncate text-zinc-400">{r.actor_id}</span>
      {failed ? (
        <span className="font-semibold text-red-400">{r.detail.error_code}</span>
      ) : (
        <span className="truncate text-zinc-600">
          {r.envelope_hash === '0'.repeat(64) ? '—' : shortHash(r.envelope_hash)}
        </span>
      )}
    </button>
  )
}

export function LedgerPanel({
  selectedEnvelopeId,
  onSelectEnvelope,
}: {
  selectedEnvelopeId: string | null
  onSelectEnvelope: (id: string) => void
}) {
  const s = useStore()
  const head = s.records[s.records.length - 1]
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-xs">
        <span className="font-semibold text-zinc-300">Ledger</span>
        <span className="font-mono text-zinc-600">
          head #{head ? head.sequence_number : '—'} · {s.records.length} records
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {s.records.length === 0 ? (
          <div className="p-3 text-xs text-zinc-600">No events yet. Run a scenario.</div>
        ) : (
          s.records.map((r) => (
            <Row
              key={r.record_id}
              r={r}
              selected={!!selectedEnvelopeId && r.envelope_id === selectedEnvelopeId}
              onSelect={() => onSelectEnvelope(r.envelope_id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
