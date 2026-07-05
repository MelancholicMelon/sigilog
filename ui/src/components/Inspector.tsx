import { Lock } from 'lucide-react'
import { ancestryOf } from '../store'
import { useStore } from '../useStore'
import type { EnvelopeMeta } from '../types'

// Provenance inspector: click any envelope -> its full ancestry chain, resolved
// by walking parent_hashes (envelope_hashes) via the byHash index. "The
// decision carries its own receipts."

function short(h: string) {
  return h.slice(0, 10)
}

function EnvelopeCard({
  m,
  isSelected,
  isRoot,
  onSelect,
}: {
  m: EnvelopeMeta
  isSelected: boolean
  isRoot: boolean
  onSelect: (id: string) => void
}) {
  const sealed = m.payload_mode === 'SEALED'
  return (
    <button
      onClick={() => onSelect(m.envelope_id)}
      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
        isSelected
          ? 'border-amber-400/70 bg-amber-400/5'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-zinc-200">{m.message_type}</span>
        <span className="font-mono text-zinc-600">{short(m.envelope_hash)}</span>
      </div>
      <div className="text-zinc-500">
        {m.sender_id} → {m.recipient_ids.join(', ')}
      </div>
      <div
        className={`flex items-center gap-1 font-mono ${sealed ? 'text-amber-300' : 'text-emerald-300'}`}
      >
        {sealed && <Lock className="h-3 w-3 shrink-0" />}
        {m.payload_preview}
      </div>
      {isRoot ? (
        <div className="text-zinc-600">root · original content</div>
      ) : (
        <div className="text-zinc-600">parents: {m.parent_hashes.map(short).join(', ')}</div>
      )}
    </button>
  )
}

export function Inspector({
  selectedEnvelopeId,
  onSelectEnvelope,
}: {
  selectedEnvelopeId: string | null
  onSelectEnvelope: (id: string) => void
}) {
  useStore() // re-render when the store updates
  const chain = selectedEnvelopeId ? ancestryOf(selectedEnvelopeId) : []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">
        Provenance
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {chain.length === 0 ? (
          <div className="p-1 text-xs text-zinc-600">
            Click a message (graph node or ledger row) to trace its ancestry back to the original
            data.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {chain.map((m, i) => (
              <div key={m.envelope_hash}>
                <EnvelopeCard
                  m={m}
                  isSelected={m.envelope_id === selectedEnvelopeId}
                  isRoot={m.parent_hashes.length === 0}
                  onSelect={onSelectEnvelope}
                />
                {i < chain.length - 1 && (
                  <div className="py-0.5 text-center text-[10px] uppercase tracking-wider text-zinc-600">
                    ↑ derived from
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
