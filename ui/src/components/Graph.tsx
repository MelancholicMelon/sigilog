import { useEffect, useRef, useState } from 'react'
import { useStore } from '../useStore'
import { useRegistry } from '../useRegistry'
import type { AgentId } from '../config'

// Hand-rolled SVG. 4 fixed nodes on a square; the loan flow runs clockwise as a
// cycle (intake -> risk -> compliance -> decision -> intake). Packets animate
// along edges on SENT (rAF lerp — bulletproof for the demo). Node color is
// derived from each agent's latest verify outcome.

const R = 34
const W = 620
const H = 420
const POS: Record<AgentId, { x: number; y: number }> = {
  'intake-agent': { x: 130, y: 90 },
  'risk-agent': { x: 490, y: 90 },
  'compliance-agent': { x: 490, y: 330 },
  'decision-agent': { x: 130, y: 330 },
}
const EDGES: [AgentId, AgentId][] = [
  ['intake-agent', 'risk-agent'],
  ['risk-agent', 'compliance-agent'],
  ['compliance-agent', 'decision-agent'],
  ['decision-agent', 'intake-agent'],
]

// Shorten an endpoint to the node's rim so lines/arrows don't hide under nodes.
function rim(from: { x: number; y: number }, to: { x: number; y: number }, pad = R + 4) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: to.x - (dx / len) * pad, y: to.y - (dy / len) * pad }
}

type NodeStatus = 'idle' | 'verified' | 'rejected' | 'opened'
type Packet = { id: string; from: { x: number; y: number }; to: { x: number; y: number }; born: number }

const DURATION = 1100

export function Graph({
  selectedEnvelopeId,
  onSelectEnvelope,
}: {
  selectedEnvelopeId: string | null
  onSelectEnvelope: (id: string) => void
}) {
  const s = useStore()
  const reg = useRegistry()

  // Node status from the latest verify/open outcome per agent.
  const status: Record<string, NodeStatus> = {}
  for (const r of s.records) {
    if (r.event_type === 'VERIFIED') status[r.actor_id] = 'verified'
    else if (r.event_type === 'VERIFICATION_FAILED') status[r.actor_id] = 'rejected'
    else if (r.event_type === 'OPENED' && status[r.actor_id] !== 'verified')
      status[r.actor_id] = 'opened'
  }
  // Latest error code shown near the rejecting node.
  const lastFail = [...s.records].reverse().find((r) => r.event_type === 'VERIFICATION_FAILED')

  // --- packet animation ---
  const [packets, setPackets] = useState<Packet[]>([])
  const processed = useRef(0)
  const raf = useRef<number>(0)
  const [, setTick] = useState(0)

  // Animate off the store's activity signal (works for live AND replay: a
  // replayed SENT bumps activitySeq even though its record is deduped).
  useEffect(() => {
    const a = s.lastActivity
    if (!a || a.activitySeq <= processed.current) return
    processed.current = a.activitySeq
    if (a.record.event_type !== 'SENT') return
    const meta = s.envById[a.record.envelope_id]
    if (!meta) return
    const from = POS[meta.sender_id as AgentId]
    const to = POS[meta.recipient_ids[0] as AgentId]
    if (from && to) {
      setPackets((p) => [
        ...p,
        { id: `${a.activitySeq}-${a.record.record_id}`, from, to, born: performance.now() },
      ])
    }
  }, [s.lastActivity, s.envById])

  useEffect(() => {
    if (packets.length === 0) return
    const loop = () => {
      const now = performance.now()
      setPackets((p) => p.filter((pk) => now - pk.born < DURATION))
      setTick((t) => t + 1)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [packets.length])

  const nodeFill = (st: NodeStatus | undefined) =>
    st === 'rejected'
      ? '#7f1d1d'
      : st === 'verified'
        ? '#065f46'
        : st === 'opened'
          ? '#3f3f46'
          : '#27272a'
  const nodeStroke = (st: NodeStatus | undefined) =>
    st === 'rejected' ? '#f87171' : st === 'verified' ? '#34d399' : '#52525b'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#52525b" />
        </marker>
      </defs>

      {/* edges */}
      {EDGES.map(([a, b]) => {
        const p1 = rim(POS[b], POS[a])
        const p2 = rim(POS[a], POS[b])
        return (
          <line
            key={`${a}-${b}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="#3f3f46"
            strokeWidth={2}
            markerEnd="url(#arrow)"
          />
        )
      })}

      {/* in-flight packets */}
      {packets.map((pk) => {
        const t = Math.min((performance.now() - pk.born) / DURATION, 1)
        const x = pk.from.x + (pk.to.x - pk.from.x) * t
        const y = pk.from.y + (pk.to.y - pk.from.y) * t
        return <circle key={pk.id} cx={x} cy={y} r={7} fill="#fbbf24" stroke="#000" strokeWidth={1} />
      })}

      {/* nodes */}
      {(Object.keys(POS) as AgentId[]).map((id) => {
        const p = POS[id]
        const st = status[id]
        const selectedHere =
          selectedEnvelopeId && s.envById[selectedEnvelopeId]?.sender_id === id
        return (
          <g key={id} className="cursor-pointer" onClick={() => {
            // Clicking a node selects the latest envelope it sent.
            const sent = [...s.records].reverse().find(
              (r) => r.event_type === 'SENT' && s.envById[r.envelope_id]?.sender_id === id,
            )
            if (sent) onSelectEnvelope(sent.envelope_id)
          }}>
            <circle
              cx={p.x}
              cy={p.y}
              r={R}
              fill={nodeFill(st)}
              stroke={selectedHere ? '#fbbf24' : nodeStroke(st)}
              strokeWidth={selectedHere ? 3 : 2}
            />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={12} fill="#e4e4e7" fontWeight={600}>
              {reg[id]?.name ?? id}
            </text>
            {st === 'verified' && (
              <text x={p.x + R - 6} y={p.y - R + 12} fontSize={16}>✅</text>
            )}
            {st === 'rejected' && (
              <text x={p.x + R - 6} y={p.y - R + 12} fontSize={16}>❌</text>
            )}
            {st === 'rejected' && lastFail?.actor_id === id && (
              <text x={p.x} y={p.y + R + 16} textAnchor="middle" fontSize={11} fill="#f87171" fontFamily="monospace">
                {lastFail.detail.error_code}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
