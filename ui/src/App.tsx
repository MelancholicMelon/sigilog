import { useState } from 'react'
import { useFeed } from './feed/useFeed'
import { useStore } from './useStore'
import { getFeedMode } from './config'
import { Graph } from './components/Graph'
import { LedgerPanel } from './components/LedgerPanel'
import { Inspector } from './components/Inspector'
import { Controls } from './components/Controls'
import { ReplayBar } from './components/ReplayBar'
import { Oversight } from './components/Oversight'

type RightTab = 'ledger' | 'oversight'

function App() {
  useFeed()
  const s = useStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('oversight')

  return (
    <div className="flex h-screen flex-col gap-3 p-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            SigiLog — Trust &amp; Provenance Console
          </h1>
          <p className="text-xs text-zinc-500">
            feed={getFeedMode()} · {s.records.length} ledger records · the
            transport is untrusted; trust lives in the cryptography
          </p>
        </div>
        <Controls />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-3">
        {/* left column: graph over inspector */}
        <div className="grid min-h-0 grid-rows-[1fr_260px] gap-3">
          <div className="rounded border border-zinc-700 bg-zinc-900/40 p-2">
            <Graph selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
          </div>
          <div className="min-h-0 rounded border border-zinc-700 bg-zinc-900/40">
            <Inspector selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
          </div>
        </div>

        {/* right column: tabbed — Audit Ledger | Case Oversight */}
        <div className="flex min-h-0 flex-col rounded border border-zinc-700 bg-zinc-900/40">
          <div className="flex shrink-0 border-b border-zinc-700 text-xs">
            {(['oversight', 'ledger'] as RightTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  rightTab === tab
                    ? 'border-b-2 border-amber-400 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {tab === 'oversight' ? '🏦 Case Oversight' : '🔗 Audit Ledger'}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === 'ledger' ? (
              <LedgerPanel selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
            ) : (
              <Oversight onSelectEnvelope={setSelected} />
            )}
          </div>
        </div>
      </div>

      <ReplayBar />
    </div>
  )
}

export default App
