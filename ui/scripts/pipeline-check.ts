// Headless runtime check of the store + mockfeed pipeline (no browser).
// Run: npx tsx scripts/pipeline-check.ts
import { getState, resetStore } from '../src/store'
import {
  mockRegisterAgents,
  mockRunAudit,
  mockScenarioCorrupt,
  mockScenarioHappy,
} from '../src/feed/mockfeed'

let failures = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

async function main() {
  // --- happy path ---
  resetStore()
  mockRegisterAgents()
  await mockScenarioHappy()
  const s = getState()
  const types = new Set(s.records.map((r) => r.event_type))
  check('happy: 5 REGISTERED (genesis+4)', s.records.filter((r) => r.event_type === 'REGISTERED').length === 5)
  check('happy: has SENT/DELIVERED/VERIFIED/OPENED', ['SENT', 'DELIVERED', 'VERIFIED', 'OPENED'].every((t) => types.has(t as never)))
  check('happy: 4 envelopes indexed by id', Object.keys(s.envById).length === 4)
  check('happy: envById and envByHash same size', Object.keys(s.envById).length === Object.keys(s.envByHash).length)
  const decision = Object.values(s.envById).find((e) => e.message_type === 'DECISION')
  check('happy: DECISION has 2 parents', !!decision && decision.parent_hashes.length === 2)
  const sealed = Object.values(s.envById).find((e) => e.payload_mode === 'SEALED')
  check('happy: SEALED preview hides plaintext (🔒)', !!sealed && sealed.payload_preview.includes('🔒') && !/name|income|amount/.test(sealed.payload_preview))
  check('happy: sequence numbers strictly increasing', s.records.every((r, i) => i === 0 || r.sequence_number > s.records[i - 1].sequence_number))
  check('happy: no VERIFICATION_FAILED', !types.has('VERIFICATION_FAILED'))

  // --- ancestry walk (inspector foundation) ---
  const { ancestryOf } = await import('../src/store')
  const chain = decision ? ancestryOf(decision.envelope_id) : []
  check('ancestry: DECISION walks back to a parentless root', chain.some((e) => e.parent_hashes.length === 0))

  // --- corrupt path ---
  resetStore()
  mockRegisterAgents()
  await mockScenarioCorrupt()
  const c = getState()
  const failed = c.records.find((r) => r.event_type === 'VERIFICATION_FAILED')
  check('corrupt: emits VERIFICATION_FAILED', !!failed)
  check('corrupt: error_code is ERR_SIG_INVALID', failed?.detail.error_code === 'ERR_SIG_INVALID')
  check('corrupt: checked_by compliance-agent', failed?.detail.checked_by === 'compliance-agent')
  check('corrupt: chain stops (no DECISION)', !Object.values(c.envById).some((e) => e.message_type === 'DECISION'))
  check('corrupt: malicious auto-disabled at end', c.maliciousMode === false)

  // --- audit broken ---
  await mockRunAudit(true)
  const a = getState()
  check('audit: reports CHAIN_BROKEN_AT', a.audit.result?.chain === 'CHAIN_BROKEN_AT')
  check('audit: broken_at_seq is a number', typeof a.audit.result?.broken_at_seq === 'number')

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
