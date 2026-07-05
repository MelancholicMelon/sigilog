import { useEffect, useState } from 'react'
import { AGENT_FALLBACK, RELAY_BASE, getFeedMode } from './config'
import type { AgentId } from './config'

interface RegistryAgent {
  agent_id: string
  public_key: string
  role: string
  org: string
}

// Agent display metadata. Real mode fetches GET :8080/registry (transport.md §3);
// mock mode uses the pinned fallback so names render before B is up.
export function useRegistry(): Record<string, { name: string; role: string; org: string }> {
  const [reg, setReg] = useState(() =>
    Object.fromEntries(
      Object.entries(AGENT_FALLBACK).map(([id, m]) => [id, m]),
    ) as Record<string, { name: string; role: string; org: string }>,
  )

  useEffect(() => {
    if (getFeedMode() !== 'real') return
    fetch(`${RELAY_BASE}/registry`)
      .then((r) => r.json())
      .then((data: { agents: RegistryAgent[] }) => {
        const next: Record<string, { name: string; role: string; org: string }> = {}
        for (const a of data.agents) {
          const fb = AGENT_FALLBACK[a.agent_id as AgentId]
          next[a.agent_id] = { name: fb?.name ?? a.agent_id, role: a.role, org: a.org }
        }
        setReg((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {
        /* keep fallback */
      })
  }, [])

  return reg
}
