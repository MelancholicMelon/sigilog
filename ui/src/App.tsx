import { useState } from 'react'
import { useFeed } from './feed/useFeed'
import { useStore } from './useStore'
import { getFeedMode } from './config'
import { Graph } from './components/Graph'
import { LedgerPanel } from './components/LedgerPanel'
import { Inspector } from './components/Inspector'
import { Controls } from './components/Controls'
import { ReplayBar } from './components/ReplayBar'

function App() {
  useFeed()
  const s = useStore()
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="flex h-screen flex-col gap-3 p-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            AgentSeal — Trust &amp; Provenance Console
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
        {/* right column: full-height ledger */}
        <div className="min-h-0 rounded border border-zinc-700 bg-zinc-900/40">
          <LedgerPanel selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
        </div>
      </div>

      <ReplayBar />
    </div>
  )
}

export default App
