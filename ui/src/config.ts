// Central config. One place for B's base URL + the event source mode.
// contracts/transport.md §1: relay/ledger/stream/control all live on :8080.

export const RELAY_BASE = 'http://localhost:8080'

// Runtime source toggle: ?feed=mock (default) or ?feed=real.
// Lets integration with B flip mock<->real without a code edit.
export type FeedMode = 'mock' | 'real'

export function getFeedMode(): FeedMode {
  const p = new URLSearchParams(window.location.search).get('feed')
  return p === 'real' ? 'real' : 'mock'
}

// contracts/transport.md §5 — pinned names. Ordered for the graph layout.
export const AGENT_IDS = [
  'intake-agent',
  'risk-agent',
  'compliance-agent',
  'decision-agent',
] as const
export type AgentId = (typeof AGENT_IDS)[number]

// Fallback display metadata until GET /registry is available.
export const AGENT_FALLBACK: Record<
  AgentId,
  { name: string; role: string; org: string }
> = {
  'intake-agent': { name: 'Intake', role: 'Loan intake', org: 'Demo Bank' },
  'risk-agent': { name: 'Risk', role: 'Risk assessment', org: 'Demo Bank' },
  'compliance-agent': {
    name: 'Compliance',
    role: 'Policy check',
    org: 'Demo Bank',
  },
  'decision-agent': { name: 'Decision', role: 'Approve / deny', org: 'Demo Bank' },
}
