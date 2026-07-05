import { FileWarning, Play, Radio, RotateCcw, SearchCheck, ShieldCheck, ShieldX, Zap } from 'lucide-react'
import { getFeedMode } from '../config'
import { corruptNext, devBreakLedger, isLedgerBroken, runAudit, runScenario } from '../feed/actions'
import { useStore } from '../useStore'

// Control buttons + live status strip. Buttons are fire-and-forget (results
// arrive on the stream). The big red corrupt button is the demo centerpiece.

export function Controls() {
  const s = useStore()
  const mock = getFeedMode() === 'mock'
  const audit = s.audit
  const pct = audit.total > 0 ? Math.round((audit.checked / audit.total) * 100) : 0

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
          onClick={runScenario}
        >
          <Play className="h-3.5 w-3.5" />
          Run scenario
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-red-50 transition-colors hover:bg-red-600"
          onClick={corruptNext}
        >
          <Zap className="h-3.5 w-3.5" />
          Corrupt next message
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100"
          onClick={runAudit}
        >
          <SearchCheck className="h-3.5 w-3.5" />
          Run audit
        </button>
        {mock && (
          <button
            className="flex items-center gap-1.5 rounded-md border border-dashed border-zinc-700 px-3 py-1.5 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
            onClick={devBreakLedger}
            title="mock only: models a hand-edited ledger; next audit reports a break"
          >
            <FileWarning className="h-3.5 w-3.5" />
            Tamper ledger{isLedgerBroken() ? ' (armed)' : ''}
          </button>
        )}
      </div>

      {/* status strip */}
      <div className="flex items-center gap-2 text-xs">
        {s.maliciousMode && (
          <span className="card-in flex animate-pulse items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white">
            <Radio className="h-3.5 w-3.5" />
            Relay compromised — next message will be mutated
          </span>
        )}
        {audit.total > 0 && !audit.result && (
          <span className="flex items-center gap-2 rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-400">
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
              <span
                className="block h-full rounded-full bg-amber-400 transition-all"
                style={{ width: `${pct}%` }}
              />
            </span>
            auditing {audit.checked}/{audit.total}
          </span>
        )}
        {audit.result &&
          (audit.result.chain === 'CHAIN_OK' ? (
            <span className="card-in flex items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-950/60 px-2.5 py-1 font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Chain intact · {audit.result.signatures_ok} signatures verified
            </span>
          ) : (
            <span className="card-in flex items-center gap-1.5 rounded-md border border-red-700/60 bg-red-950/60 px-2.5 py-1 font-semibold text-red-300">
              <ShieldX className="h-3.5 w-3.5" />
              Chain broken at #{audit.result.broken_at_seq} — history was altered
            </span>
          ))}
        {s.replaying && (
          <span className="card-in flex items-center gap-1.5 rounded-md border border-amber-600/60 bg-amber-950/60 px-2.5 py-1 font-semibold text-amber-300">
            <RotateCcw className="h-3.5 w-3.5" />
            Replay
          </span>
        )}
      </div>
    </div>
  )
}
