# ui/ — demo console

The trust & provenance demo console: live agent graph, ledger panel, envelope
inspector, oversight view, and replay bar.

**Stack:** TypeScript — React + Vite + Tailwind v4.

## Run

```bash
npm install
npm run dev      # http://localhost:3000  (port pinned, strict)
```

## What it consumes (all via frozen contracts)

- **Live event stream:** SSE `GET http://localhost:8080/events` (served by
  `infra/`) — `contracts/events.schema.md`. Without a running relay the app
  falls back to the built-in **mockfeed**, which emits schema-exact invented events.
- **Control endpoints** (fire-and-forget, results arrive on the stream):
  `POST :8080/relay/malicious`, `/scenario/start`, `/audit/run`, `/replay`.
- **Registry:** `GET :8080/registry` for agent names/roles.

## Source toggle (mock vs real)

`src/config.ts` holds the `:8080` base URL and the event source mode. Switch
`mock` ↔ `real` at runtime via the `?feed=mock|real` URL param — no code edit
needed. Use **`?feed=real`** for the live demo.
