import { useEffect, useRef, useState } from 'react'
import { Gauge, Inbox, Scale, Stamp } from 'lucide-react'
import { useStore } from '../useStore'
import { useRegistry } from '../useRegistry'
import type { AgentId } from '../config'

// Hand-rolled SVG. 4 fixed nodes on a square; the loan flow runs clockwise as a
// cycle (intake -> risk -> compliance -> decision -> intake). Packets animate
// along edges on SENT (rAF lerp — bulletproof for the demo). Node color is
// derived from each agent's latest verify outcome.

const R = 30
const W = 820
const H = 420
const POS: Record<AgentId, { x: number; y: number }> = {
  'intake-agent': { x: 200, y: 88 },
  'risk-agent': { x: 620, y: 88 },
  'compliance-agent': { x: 620, y: 312 },
  'decision-agent': { x: 200, y: 312 },
}
const ICON: Record<AgentId, typeof Inbox> = {
  'intake-agent': Inbox,
  'risk-agent': Gauge,
  'compliance-agent': Scale,
  'decision-agent': Stamp,
}
// Edge + the message type that travels along it, with a label anchor.
const EDGES: { from: AgentId; to: AgentId; label: string; lx: number; ly: number; rotate?: number }[] = [
  { from: 'intake-agent', to: 'risk-agent', label: 'LOAN_APPLICATION', lx: 410, ly: 76 },
  { from: 'risk-agent', to: 'compliance-agent', label: 'RISK_ASSESSMENT', lx: 634, ly: 200, rotate: 90 },
  { from: 'compliance-agent', to: 'decision-agent', label: 'COMPLIANCE_CHECK', lx: 410, ly: 300 },
  { from: 'decision-agent', to: 'intake-agent', label: 'DECISION', lx: 186, ly: 200, rotate: -90 },
]

// Shorten an endpoint to the node's rim so lines/arrows don't hide under nodes.
function rim(from: { x: number; y: number }, to: { x: number; y: number }, pad = R + 6) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy) || 1
  return { x: to.x - (dx / len) * pad, y: to.y - (dy / len) * pad }
}

type NodeStatus = 'idle' | 'verified' | 'rejected' | 'opened'
type Packet = { id: string; from: { x: number; y: number }; to: { x: number; y: number }; born: number }

const DURATION = 1100
const TRAIL = [
  { dt: 0.07, r: 5, opacity: 0.35 },
  { dt: 0.14, r: 4, opacity: 0.18 },
  { dt: 0.21, r: 3, opacity: 0.08 },
]

const FILL: Record<NodeStatus, string> = {
  idle: '#191c24',
  opened: '#22262f',
  verified: '#0b2f26',
  rejected: '#38111a',
}
const STROKE: Record<NodeStatus, string> = {
  idle: '#3f3f46',
  opened: '#52525b',
  verified: '#34d399',
  rejected: '#f87171',
}

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

  // Edges currently being traversed light up.
  const hotEdges = new Set(
    packets.map((pk) => `${pk.from.x},${pk.from.y}-${pk.to.x},${pk.to.y}`),
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      <defs>
        <pattern id="dotgrid" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#1e222c" />
        </pattern>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#52525b" />
        </marker>
        <marker id="arrow-hot" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#fbbf24" />
        </marker>
      </defs>

      <rect width={W} height={H} fill="url(#dotgrid)" />

      {/* edges + message-type labels */}
      {EDGES.map((e) => {
        const p1 = rim(POS[e.to], POS[e.from])
        const p2 = rim(POS[e.from], POS[e.to])
        const hot = hotEdges.has(`${POS[e.from].x},${POS[e.from].y}-${POS[e.to].x},${POS[e.to].y}`)
        return (
          <g key={`${e.from}-${e.to}`}>
            <line
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={hot ? '#fbbf24' : '#33363f'}
              strokeWidth={hot ? 2.5 : 2}
              markerEnd={hot ? 'url(#arrow-hot)' : 'url(#arrow)'}
            />
            <text
              x={e.lx}
              y={e.ly}
              textAnchor="middle"
              fontSize={8}
              letterSpacing={1}
              fill={hot ? '#fbbf24' : '#585c68'}
              fontFamily="IBM Plex Mono, monospace"
              transform={e.rotate ? `rotate(${e.rotate} ${e.lx} ${e.ly})` : undefined}
            >
              {e.label}
            </text>
          </g>
        )
      })}

      {/* in-flight packets with fading trail */}
      {packets.map((pk) => {
        const t = Math.min((performance.now() - pk.born) / DURATION, 1)
        const at = (tt: number) => ({
          x: pk.from.x + (pk.to.x - pk.from.x) * tt,
          y: pk.from.y + (pk.to.y - pk.from.y) * tt,
        })
        const head = at(t)
        return (
          <g key={pk.id}>
            {TRAIL.map((g, i) => {
              const gt = t - g.dt
              if (gt <= 0) return null
              const p = at(gt)
              return <circle key={i} cx={p.x} cy={p.y} r={g.r} fill="#fbbf24" opacity={g.opacity} />
            })}
            <circle cx={head.x} cy={head.y} r={6.5} fill="#fbbf24" stroke="#0b0d12" strokeWidth={1.5} />
          </g>
        )
      })}

      {/* nodes */}
      {(Object.keys(POS) as AgentId[]).map((id) => {
        const p = POS[id]
        const st = status[id] ?? 'idle'
        const Icon = ICON[id]
        const selectedHere =
          selectedEnvelopeId && s.envById[selectedEnvelopeId]?.sender_id === id
        return (
          <g
            key={id}
            className="cursor-pointer"
            onClick={() => {
              // Clicking a node selects the latest envelope it sent.
              const sent = [...s.records].reverse().find(
                (r) => r.event_type === 'SENT' && s.envById[r.envelope_id]?.sender_id === id,
              )
              if (sent) onSelectEnvelope(sent.envelope_id)
            }}
          >
            {/* broken-seal alarm ring */}
            {st === 'rejected' && (
              <circle className="seal-pulse" cx={p.x} cy={p.y} r={R + 3} fill="none" stroke="#f87171" strokeWidth={2} />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={R}
              fill={FILL[st]}
              stroke={selectedHere ? '#fbbf24' : STROKE[st]}
              strokeWidth={selectedHere ? 3 : 2}
            />
            <Icon
              x={p.x - 11}
              y={p.y - 11}
              width={22}
              height={22}
              color={st === 'rejected' ? '#fca5a5' : st === 'verified' ? '#6ee7b7' : '#a1a1aa'}
              strokeWidth={1.75}
            />

            {/* verify-outcome seal badge */}
            {(st === 'verified' || st === 'rejected') && (
              <g transform={`translate(${p.x + R - 8}, ${p.y - R + 8})`}>
                <circle r={8} fill={st === 'verified' ? '#059669' : '#dc2626'} stroke="#0b0d12" strokeWidth={1.5} />
                {st === 'verified' ? (
                  <path d="M -3.2 0.2 L -1 2.6 L 3.4 -2.4" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M -2.6 -2.6 L 2.6 2.6 M 2.6 -2.6 L -2.6 2.6" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
                )}
              </g>
            )}

            {/* rejection error code, above the node so the label row stays clean */}
            {st === 'rejected' && lastFail?.actor_id === id && (
              <text
                x={p.x}
                y={p.y - R - 12}
                textAnchor="middle"
                fontSize={10}
                fill="#f87171"
                fontFamily="IBM Plex Mono, monospace"
              >
                {lastFail.detail.error_code}
              </text>
            )}

            {/* name + role below the node, outside the circle */}
            <text
              x={p.x}
              y={p.y + R + 18}
              textAnchor="middle"
              fontSize={13}
              fill="#e4e4e7"
              fontWeight={600}
              fontFamily="Space Grotesk, sans-serif"
            >
              {reg[id]?.name ?? id}
            </text>
            <text
              x={p.x}
              y={p.y + R + 32}
              textAnchor="middle"
              fontSize={9}
              letterSpacing={0.8}
              fill="#71717a"
            >
              {(reg[id]?.role ?? '').toUpperCase()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
