import { useState } from 'react'
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
    <div className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-xs">
      <button
        className="rounded bg-amber-700 px-3 py-1 font-medium hover:bg-amber-600 disabled:opacity-40"
        disabled={maxSeq === 0 || s.replaying}
        onClick={() => replay(0, effectiveTo, speed)}
      >
        ⟲ Replay 0–{effectiveTo}
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
        className="flex-1 accent-amber-500"
      />
      <span className="w-24 font-mono text-zinc-500">
        seq {effectiveTo}/{maxSeq}
      </span>
      <div className="flex items-center gap-1">
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            className={`rounded px-2 py-0.5 ${
              sp === speed ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-400'
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
