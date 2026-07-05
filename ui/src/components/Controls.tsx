import { getFeedMode } from '../config'
import { corruptNext, devBreakLedger, isLedgerBroken, runAudit, runScenario } from '../feed/actions'
import { useStore } from '../useStore'

// Control buttons + live status strip. Buttons are fire-and-forget (results
// arrive on the stream). The big red corrupt button is the demo centerpiece.

export function Controls() {
  const s = useStore()
  const mock = getFeedMode() === 'mock'
  const audit = s.audit
  const pct =
    audit.total > 0 ? Math.round((audit.checked / audit.total) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium hover:bg-emerald-600"
          onClick={runScenario}
        >
          ▶ Run scenario
        </button>
        <button
          className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold hover:bg-red-600"
          onClick={corruptNext}
        >
          ⚠ CORRUPT NEXT MESSAGE
        </button>
        <button
          className="rounded bg-indigo-700 px-3 py-1.5 text-sm font-medium hover:bg-indigo-600"
          onClick={runAudit}
        >
          🔍 Run audit
        </button>
        {mock && (
          <button
            className="rounded border border-amber-700 bg-amber-900/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-900/70"
            onClick={devBreakLedger}
            title="mock only: models a hand-edited ledger; next audit reports a break"
          >
            🩹 tamper ledger {isLedgerBroken() ? '(armed)' : ''}
          </button>
        )}
      </div>

      {/* status strip */}
      <div className="flex items-center gap-3 text-xs">
        {s.maliciousMode && (
          <span className="animate-pulse rounded bg-red-600 px-2 py-0.5 font-semibold text-white">
            ● RELAY COMPROMISED — next message will be mutated
          </span>
        )}
        {audit.total > 0 && !audit.result && (
          <span className="text-indigo-300">auditing… {audit.checked}/{audit.total} ({pct}%)</span>
        )}
        {audit.result &&
          (audit.result.chain === 'CHAIN_OK' ? (
            <span className="rounded bg-emerald-800 px-2 py-0.5 text-emerald-200">
              ✅ CHAIN_OK · {audit.result.signatures_ok} sigs verified
            </span>
          ) : (
            <span className="rounded bg-red-800 px-2 py-0.5 font-semibold text-red-100">
              ❌ CHAIN_BROKEN_AT #{audit.result.broken_at_seq} · history was
              altered
            </span>
          ))}
        {s.replaying && (
          <span className="rounded bg-amber-700 px-2 py-0.5 text-amber-100">⟲ REPLAY</span>
        )}
      </div>
    </div>
  )
}
