// Oversight — business-facing case dashboard.
// Shows each loan decision in plain language with a link to its cryptographic
// audit trail. Reads from the same store the infrastructure view uses.

import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, FileText, Lock, XCircle } from 'lucide-react'
import { ancestryOf, getState } from '../store'
import { useStore } from '../useStore'
import type { EnvelopeMeta } from '../types'

function parseKV(preview: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of preview.split(' ')) {
    const eq = chunk.indexOf('=')
    if (eq > 0) out[chunk.slice(0, eq)] = chunk.slice(eq + 1)
  }
  return out
}

function timestamp(envelopeId: string): string {
  const rec = getState().records.find(
    (r) => r.event_type === 'SENT' && r.envelope_id === envelopeId,
  )
  if (!rec) return ''
  return new Date(rec.timestamp).toLocaleTimeString()
}

function CaseCard({
  decision,
  onSelectEnvelope,
}: {
  decision: EnvelopeMeta
  onSelectEnvelope: (id: string) => void
}) {
  const [trailOpen, setTrailOpen] = useState(false)
  const chain = ancestryOf(decision.envelope_id)
  const root = chain[chain.length - 1] // LOAN_APPLICATION — always SEALED
  const riskEnv = chain.find((m) => m.message_type === 'RISK_ASSESSMENT')
  const complianceEnv = chain.find((m) => m.message_type === 'COMPLIANCE_CHECK')

  const d = parseKV(decision.payload_preview)
  const r = riskEnv ? parseKV(riskEnv.payload_preview) : {}
  const c = complianceEnv ? parseKV(complianceEnv.payload_preview) : {}

  const approved = d.decision === 'APPROVE'
  const caseId = (root ?? decision).envelope_hash.slice(0, 10)

  return (
    <div
      className={`card-in rounded-lg border px-3 py-2.5 ${
        approved
          ? 'border-emerald-800/60 bg-emerald-950/30'
          : 'border-red-800/60 bg-red-950/20'
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-zinc-500">Case #{caseId}</span>
        <span
          className={`flex items-center gap-1 text-sm font-bold ${
            approved ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {approved ? 'APPROVED' : 'DENIED'}
        </span>
      </div>

      {/* risk + policy row */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 text-xs">
        {r.risk && (
          <div>
            <span className="text-zinc-600">Risk: </span>
            <span className={r.risk === 'HIGH' ? 'font-semibold text-red-400' : 'font-semibold text-emerald-400'}>
              {r.risk}
            </span>
            {r.score && <span className="ml-1 text-zinc-600">({r.score})</span>}
          </div>
        )}
        {c.policy && (
          <div>
            <span className="text-zinc-600">Policy: </span>
            <span className="text-zinc-300">{c.policy.replace(/_/g, ' ')}</span>
          </div>
        )}
      </div>

      {/* PII protection note */}
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
        {root?.payload_mode === 'SEALED' ? (
          <>
            <Lock className="h-3 w-3 text-amber-400/80" />
            Applicant PII sealed — protected from relay and ledger
          </>
        ) : (
          <>
            <FileText className="h-3 w-3" />
            Application data in chain
          </>
        )}
      </div>

      {/* provenance summary */}
      <div className="mt-1.5 text-[11px] text-zinc-600">
        {chain.length} signed hop{chain.length !== 1 ? 's' : ''} ·{' '}
        {chain.map((m) => m.sender_id.replace('-agent', '')).join(' → ')}
      </div>

      {/* footer */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-zinc-600">{timestamp(decision.envelope_id)}</span>
        <button
          onClick={() => {
            setTrailOpen((v) => !v)
            onSelectEnvelope(decision.envelope_id)
          }}
          className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          {trailOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {trailOpen ? 'Hide trail' : 'View audit trail'}
        </button>
      </div>

      {/* inline provenance trail as a timeline */}
      {trailOpen && (
        <div className="mt-2 border-t border-zinc-700/60 pt-2">
          <div className="ml-1 border-l border-zinc-700/70 pl-3">
            {chain.map((m) => (
              <div key={m.envelope_hash} className="relative pb-3 last:pb-0">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full border border-zinc-500 bg-zinc-900" />
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-zinc-300">{m.message_type}</span>
                  <span className="font-mono text-zinc-600">{m.envelope_hash.slice(0, 10)}</span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  {m.sender_id.replace('-agent', '')} →{' '}
                  {m.recipient_ids.map((r) => r.replace('-agent', '')).join(', ')}
                </div>
                <div
                  className={`flex items-center gap-1 font-mono text-[10px] ${
                    m.payload_mode === 'SEALED' ? 'text-amber-400/70' : 'text-emerald-400/70'
                  }`}
                >
                  {m.payload_mode === 'SEALED' && <Lock className="h-2.5 w-2.5 shrink-0" />}
                  {m.payload_preview.slice(0, 60)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">
            Newest first · each hop signed by its sender
          </div>
        </div>
      )}
    </div>
  )
}

export function Oversight({
  onSelectEnvelope,
}: {
  onSelectEnvelope: (id: string) => void
}) {
  const s = useStore()
  const decisions = Object.values(s.envById).filter((m) => m.message_type === 'DECISION')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-xs">
        <span className="font-semibold text-zinc-300">Case oversight</span>
        <span className="text-zinc-600">
          {decisions.length} decision{decisions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {decisions.length === 0 ? (
          <div className="space-y-2 p-1 text-xs text-zinc-500">
            <p className="font-medium text-zinc-400">No decisions yet.</p>
            <p className="leading-relaxed text-zinc-600">
              Every loan decision that flows through the agent pipeline appears here in plain
              language. Each entry is backed by a cryptographic audit trail — signed by the
              producing agent, with applicant PII sealed so even this dashboard never sees it in
              plaintext.
            </p>
            <p className="leading-relaxed text-zinc-600">
              Click <span className="rounded bg-zinc-800 px-1 font-mono">Run scenario</span> to
              process a loan application.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {decisions.map((d) => (
              <CaseCard key={d.envelope_id} decision={d} onSelectEnvelope={onSelectEnvelope} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-600">
        Ed25519-signed · provenance DAG cryptographically bound · tamper-evident ledger
      </div>
    </div>
  )
}
