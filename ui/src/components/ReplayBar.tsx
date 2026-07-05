import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { replay } from '../feed/actions'
import { useStore } from '../useStore'

// Timeline scrubber. Picks a range [0..to] and a speed, then replays those
// recorded events through the same pipeline (replay_event -> graph re-animates,
// REPLAY banner shows). "Six months later, a regulator can re-watch this."

const SPEEDS = [1, 2, 4, 8]

export function ReplayBar() {
  const s = useStore()
  const maxSeq = s.records.length ? s.records[s.records.length - 1].sequence_number : 0
  // `pinned` = follow the ledger head; the user unpins by dragging the scrubber.
  const [pinned, setPinned] = useState(true)
  const [draggedTo, setDraggedTo] = useState(0)
  const [speed, setSpeed] = useState(4)

  const effectiveTo = pinned ? maxSeq : Math.min(draggedTo, maxSeq)

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs">
      <span className="hidden font-medium uppercase tracking-wider text-zinc-500 sm:block">
        Audit replay
      </span>
      <button
        className="flex items-center gap-1.5 rounded-md border border-amber-600/60 bg-amber-950/40 px-3 py-1 font-medium text-amber-300 transition-colors hover:bg-amber-900/40 disabled:opacity-40"
        disabled={maxSeq === 0 || s.replaying}
        onClick={() => replay(0, effectiveTo, speed)}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Replay 0–{effectiveTo}
      </button>
      <input
        type="range"
        min={0}
        max={maxSeq}
        value={effectiveTo}
        onChange={(e) => {
          setPinned(false)
          setDraggedTo(Number(e.target.value))
        }}
        className="scrubber flex-1"
      />
      <span className="w-24 font-mono text-zinc-500">
        seq {effectiveTo}/{maxSeq}
      </span>
      <div className="flex items-center gap-1">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className={`rounded-md px-2 py-0.5 transition-colors ${
              sp === speed
                ? 'bg-amber-500 font-semibold text-zinc-950'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setSpeed(sp)}
          >
            {sp}×
          </button>
        ))}
      </div>
    </div>
  )
}
