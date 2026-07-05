// Oversight — business-facing case dashboard.
// Shows each loan decision in plain language with a link to its cryptographic
// audit trail. Reads from the same store the infrastructure view uses.

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
      className={`rounded border px-3 py-2.5 ${
        approved
          ? 'border-emerald-800/60 bg-emerald-950/30'
          : 'border-red-800/60 bg-red-950/20'
      }`}
    >
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-zinc-500">Case #{caseId}</span>
        <span className={`text-sm font-bold ${approved ? 'text-emerald-400' : 'text-red-400'}`}>
          {approved ? '✅ APPROVED' : '❌ DENIED'}
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
      <div className="mt-1.5 text-[11px] text-zinc-600">
        {root?.payload_mode === 'SEALED'
          ? '🔒 Applicant PII sealed — protected from relay and ledger'
          : '📄 Application data in chain'}
      </div>

      {/* provenance summary */}
      <div className="mt-1.5 text-[11px] text-zinc-600">
        {chain.length} signed hop{chain.length !== 1 ? 's' : ''} · {chain.map((m) => m.sender_id.replace('-agent', '')).join(' → ')}
      </div>

      {/* footer */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-zinc-600">{timestamp(decision.envelope_id)}</span>
        <button
          onClick={() => onSelectEnvelope(decision.envelope_id)}
          className="rounded bg-zinc-700 px-2 py-0.5 text-[11px] hover:bg-zinc-600"
        >
          View audit trail →
        </button>
      </div>
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
      <div className="flex items-center justify-between border-b border-zinc-700 px-2 py-1 text-xs">
        <span className="font-semibold text-zinc-300">Case Oversight</span>
        <span className="text-zinc-600">
          {decisions.length} decision{decisions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {decisions.length === 0 ? (
          <div className="space-y-2 text-xs text-zinc-500">
            <p className="font-medium text-zinc-400">No decisions yet.</p>
            <p className="leading-relaxed text-zinc-600">
              Every loan decision that flows through the agent pipeline appears here in plain language. Each entry is backed by a cryptographic audit trail — signed by the producing agent, with applicant PII sealed so even this dashboard never sees it in plaintext.
            </p>
            <p className="leading-relaxed text-zinc-600">
              Click <span className="rounded bg-zinc-800 px-1 font-mono">▶ Run scenario</span> to process a loan application.
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

      <div className="border-t border-zinc-800 px-2 py-1 text-[10px] text-zinc-700">
        Ed25519-signed · provenance DAG cryptographically bound · tamper-evident ledger
      </div>
    </div>
  )
}
