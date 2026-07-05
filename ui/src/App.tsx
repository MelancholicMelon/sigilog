import { useState } from 'react'
import { Landmark, MessagesSquare, ScrollText, ShieldCheck } from 'lucide-react'
import { useFeed } from './feed/useFeed'
import { useStore } from './useStore'
import { getFeedMode } from './config'
import { Graph } from './components/Graph'
import { LedgerPanel } from './components/LedgerPanel'
import { Inspector } from './components/Inspector'
import { Controls } from './components/Controls'
import { ReplayBar } from './components/ReplayBar'
import { Oversight } from './components/Oversight'
import { AgentConsole } from './components/AgentConsole'

type RightTab = 'ledger' | 'oversight' | 'console'

const TABS: [RightTab, string, typeof Landmark][] = [
  ['oversight', 'Cases', Landmark],
  ['console', 'Agent log', MessagesSquare],
  ['ledger', 'Ledger', ScrollText],
]

function App() {
  useFeed()
  const s = useStore()
  const [selected, setSelected] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('oversight')

  return (
    <div className="flex h-screen flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10">
            <ShieldCheck className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="font-display text-lg font-semibold tracking-tight text-zinc-100">
                SigiLog
              </h1>
              <span className="text-sm text-zinc-500">Trust &amp; Provenance Console</span>
              <span className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {getFeedMode()} feed
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Every message signed. Every hop provable.{' '}
              <span className="font-mono text-zinc-600">{s.records.length} ledger records</span>
            </p>
          </div>
        </div>
        <Controls />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] gap-3">
        {/* left column: graph over inspector */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_260px] gap-3">
          <div className="min-h-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
            <Graph selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
          </div>
          <div className="min-h-0 rounded-lg border border-zinc-800 bg-zinc-900/40">
            <Inspector selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
          </div>
        </div>

        {/* right column: tabbed */}
        <div className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40">
          <div className="flex shrink-0 border-b border-zinc-800 text-xs">
            {TABS.map(([tab, label, Icon]) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-medium transition-colors ${
                  rightTab === tab
                    ? 'border-b-2 border-amber-400 text-zinc-100'
                    : 'border-b-2 border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {rightTab === 'ledger' ? (
              <LedgerPanel selectedEnvelopeId={selected} onSelectEnvelope={setSelected} />
            ) : rightTab === 'console' ? (
              <AgentConsole />
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
