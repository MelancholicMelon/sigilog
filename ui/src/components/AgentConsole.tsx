// AgentConsole — human-readable conversation log derived from the live ledger.
// Converts raw cryptographic events into plain-language agent messages so
// non-technical viewers understand what the agents are doing and why.

import { useStore } from '../useStore'
import type { LedgerRecord, EnvelopeMeta } from '../types'

const AGENT_META: Record<string, { emoji: string; label: string; color: string }> = {
  'intake-agent':     { emoji: '🏦', label: 'Loan Intake',       color: 'text-blue-400' },
  'risk-agent':       { emoji: '📊', label: 'Risk Assessment',   color: 'text-yellow-400' },
  'compliance-agent': { emoji: '⚖️', label: 'Compliance',        color: 'text-purple-400' },
  'decision-agent':   { emoji: '🔏', label: 'Decision Authority', color: 'text-emerald-400' },
  'relay':            { emoji: '🌐', label: 'Relay',             color: 'text-zinc-400' },
}

function agentMeta(id: string) {
  return AGENT_META[id] ?? { emoji: '🤖', label: id, color: 'text-zinc-400' }
}

function parseKV(preview: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chunk of preview.split(' ')) {
    const eq = chunk.indexOf('=')
    if (eq > 0) out[chunk.slice(0, eq)] = chunk.slice(eq + 1)
  }
  return out
}

interface Msg {
  id: string
  ts: string
  agentId: string
  text: string
  tags: string[]
  kind: 'normal' | 'alert' | 'system'
}

function buildSentMessage(env: EnvelopeMeta): Msg {
  const kv = parseKV(env.payload_preview)
  let text = ''
  let tags: string[] = []

  switch (env.message_type) {
    case 'LOAN_APPLICATION':
      text =
        'New loan application received. Applicant PII has been encrypted with AES-256-GCM — only the Risk Assessment team can decrypt it. Forwarding sealed envelope to risk-agent.'
      tags = ['🔒 PII sealed', '✅ Ed25519 signed', `→ ${env.recipient_ids[0]}`]
      break
    case 'RISK_ASSESSMENT': {
      const risk = kv.risk ?? '?'
      const score = kv.score ?? '?'
      const level = risk === 'HIGH' ? '🔴' : risk === 'LOW' ? '🟢' : '🟡'
      text = `Risk analysis complete. Applicant risk profile: ${level} ${risk} (score ${score}). Assessment signed and forwarded to compliance-agent for policy review.`
      tags = [`${level} Risk: ${risk}`, `Score: ${score}`, '✅ Ed25519 signed', `→ ${env.recipient_ids[0]}`]
      break
    }
    case 'COMPLIANCE_CHECK': {
      const policy = (kv.policy ?? '?').replace(/_/g, ' ')
      text = `Policy evaluation complete against regulatory rulebook. Outcome: ${policy}. Forwarding signed compliance report to decision-agent.`
      tags = [`📋 Policy: ${policy}`, '✅ Ed25519 signed', `→ ${env.recipient_ids[0]}`]
      break
    }
    case 'DECISION': {
      const decision = kv.decision ?? '?'
      const approved = decision === 'APPROVE'
      const nParents = env.parent_hashes.length
      text = `Final decision rendered after reviewing all upstream assessments. Outcome: ${approved ? '✅ APPROVED' : '❌ DENIED'}. Decision is cryptographically anchored to ${nParents} parent envelope${nParents !== 1 ? 's' : ''} and permanently recorded.`
      tags = [
        approved ? '✅ APPROVED' : '❌ DENIED',
        `🔗 ${nParents} parent hash${nParents !== 1 ? 'es' : ''}`,
        '✅ Ed25519 signed',
      ]
      break
    }
    default:
      text = env.payload_preview
      tags = ['✅ signed']
  }

  return {
    id: `sent-${env.envelope_id}`,
    ts: '',
    agentId: env.sender_id,
    text,
    tags,
    kind: 'normal',
  }
}

function buildMessages(records: LedgerRecord[], envById: Record<string, EnvelopeMeta>): Msg[] {
  const msgs: Msg[] = []

  for (const r of records) {
    const env = envById[r.envelope_id]

    if (r.event_type === 'REGISTERED' && r.actor_id === 'relay') {
      msgs.push({
        id: r.record_id,
        ts: r.timestamp,
        agentId: 'relay',
        text: 'Relay initialized. Tamper-evident ledger started. Listening for agent connections.',
        tags: ['⛓ Genesis block'],
        kind: 'system',
      })
      continue
    }

    if (r.event_type === 'REGISTERED' && r.actor_id !== 'relay') {
      const m = agentMeta(r.actor_id)
      msgs.push({
        id: r.record_id,
        ts: r.timestamp,
        agentId: r.actor_id,
        text: `${m.label} agent online. Ed25519 public key registered with relay. Ready to send and verify signed envelopes.`,
        tags: ['🔑 Identity registered'],
        kind: 'system',
      })
      continue
    }

    if (r.event_type === 'SENT' && env) {
      const m = buildSentMessage(env)
      m.ts = r.timestamp
      msgs.push(m)
      continue
    }

    if (r.event_type === 'OPENED') {
      msgs.push({
        id: r.record_id,
        ts: r.timestamp,
        agentId: r.actor_id,
        text: `Sealed envelope received and unsealed using private X25519 key. Applicant data decrypted and passed to risk analysis model. PII never exposed to relay or ledger.`,
        tags: ['🔓 PII decrypted (authorized recipient only)'],
        kind: 'normal',
      })
      continue
    }

    if (r.event_type === 'VERIFICATION_FAILED') {
      const code = r.detail?.error_code ?? 'UNKNOWN'
      const descriptions: Record<string, string> = {
        ERR_SIG_INVALID: 'The Ed25519 signature does not match the message content — the message was modified in transit.',
        ERR_HASH_MISMATCH: 'Content hash does not match the declared hash — payload was tampered with.',
        ERR_UNKNOWN_SENDER: 'Sender identity not found in the agent registry.',
        ERR_PARENT_NOT_FOUND: 'A referenced parent envelope is not in the ledger — provenance chain broken.',
      }
      msgs.push({
        id: r.record_id,
        ts: r.timestamp,
        agentId: r.actor_id,
        text: `Incoming message REJECTED. ${descriptions[code] ?? code} Message discarded and incident recorded in the tamper-evident ledger. The pipeline halts here.`,
        tags: [`❌ ${code}`, '🚨 Incident logged'],
        kind: 'alert',
      })
      continue
    }
  }

  return msgs
}

function fmtTime(iso: string) {
  if (!iso) return ''
  try { return new Date(iso).toLocaleTimeString() } catch { return '' }
}

export function AgentConsole() {
  const s = useStore()
  const msgs = buildMessages(s.records, s.envById)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-700 px-2 py-1 text-xs">
        <span className="font-semibold text-zinc-300">Agent Log</span>
        <span className="text-zinc-600">{msgs.length} events</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2 space-y-2">
        {msgs.length === 0 ? (
          <div className="space-y-2 text-xs text-zinc-600">
            <p className="font-medium text-zinc-400">No activity yet.</p>
            <p className="leading-relaxed">
              This log shows a plain-language account of what each agent is doing as the loan application flows through the pipeline — from intake through risk scoring, compliance check, and final decision.
            </p>
            <p>Click <span className="rounded bg-zinc-800 px-1 font-mono">▶ Run scenario</span> to start.</p>
          </div>
        ) : (
          msgs.map((msg) => {
            const meta = agentMeta(msg.agentId)
            const isAlert = msg.kind === 'alert'
            const isSystem = msg.kind === 'system'
            return (
              <div
                key={msg.id}
                className={`rounded border px-2.5 py-2 ${
                  isAlert
                    ? 'border-red-800/60 bg-red-950/20'
                    : isSystem
                      ? 'border-zinc-700/40 bg-zinc-900/20'
                      : 'border-zinc-700/60 bg-zinc-900/40'
                }`}
              >
                {/* agent name + time */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${isAlert ? 'text-red-400' : meta.color}`}>
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="text-[10px] text-zinc-600">{fmtTime(msg.ts)}</span>
                </div>

                {/* message body */}
                <p className={`text-xs leading-relaxed ${isAlert ? 'text-red-300' : isSystem ? 'text-zinc-500' : 'text-zinc-300'}`}>
                  {msg.text}
                </p>

                {/* tags */}
                {msg.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          isAlert ? 'bg-red-900/40 text-red-400' : 'bg-zinc-800 text-zinc-500'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
