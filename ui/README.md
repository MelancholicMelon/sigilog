# ui/ — Member C zone (Demo, UI & Packaging)

The trust & provenance demo console. Owned by **Member C only** (PLAN.md §13.1).

## Zone language

- **ui/: TypeScript — React + Vite + Tailwind v4** (documented here rather than
  editing the frozen `contracts/transport.md` §6 blank, which is a huddle item).

## Run

```bash
npm install
npm run dev      # http://localhost:3000  (port pinned, strict)
```

## What it consumes (all via frozen contracts)

- **Live event stream:** SSE `GET http://localhost:8080/events` (B serves) —
  `contracts/events.schema.md`. Until Member B's stream is live (~2:45) the app
  runs on the built-in **mockfeed**, which emits schema-exact invented events.
- **Control endpoints** (fire-and-forget, results arrive on the stream):
  `POST :8080/relay/malicious`, `/scenario/start`, `/audit/run`, `/replay`.
- **Registry:** `GET :8080/registry` for agent names/roles.

## Source toggle (mock vs real)

`src/config.ts` holds the `:8080` base URL and the event source mode. Switch
`mock` ↔ `real` at runtime via the `?feed=mock|real` URL param — no code edit,
so integration with B is a fast flip back and forth.
