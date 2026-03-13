# Metaverse Office Web

Updated: 2026-03-11T00:35:00+08:00

This repository is the implementation home for the Hermes-Agent metaverse-office project.

## Project rules
- repo root must stay under `/Users/cwp/Projects/metaverse-office-web`
- implementation follows `/Users/cwp/.hermes/teams/web3-company/controller/phase1-spec-package.md`
- Phase 1 is schema-first and evidence-first
- UI work must not outrun event/state/storage/query architecture
- no fake animation, no token layer, no onchain dependency for Phase 1

## Current milestone
- Phase 1 spec is review-ready in the controller workspace
- repo-local spec mirror and implementation plan exist
- minimal Phase 1 backend scaffold now exists for agent/event/timeline queries
- scaffold is aligned to the canonical seven-actor roster and controlled write boundaries
- office overview query now exposes zone layout, occupants, watch edges, and derived staleness for future UI work
- controller snapshot collector now derives evidence-backed heartbeats from workspace/tmux metadata and appends collector-backed peer-watch alerts into the existing event log
- collector snapshots now also append deduped canonical `agent_state_changed` and `agent_wrote_file` events when observed state or file-write evidence advances
- derived interaction read models now expose communication records without adding a new write path
- enriched agent detail and peer-watch alert queries now expose current evidence surfaces without adding new writes
- timeline replay slices now support evidence-first filtering by agent, event type, severity, correlation, and recent slice limit
- operator incident feed now exposes a descending read-only view over peer-watch alerts, handoffs, and reboots without adding new persistence
- correlation drill-down now exposes one read-only evidence/replay surface per `correlation_id` by aggregating existing incident, interaction, and timeline read models
- agent detail and agent-scoped incident queries now expose recent incident evidence by reusing the same read-only incident feed semantics
- agent workflow query now exposes one read-only operator slice per agent by aggregating existing detail, incident, interaction, and timeline read models
- pnpm workspace bootstrap now exists with a React + TypeScript operator shell in `apps/web` that reuses the frozen read-only office/workflow/incident/correlation queries for triage

## Key documents
- `specs/phase1-spec.md`
- `specs/api-contract.md`
- `docs/plans/phase1-kickoff-plan.md`
- `docs/plans/phase1-react-operator-shell-plan.md`
- `docs/adr/0002-react-operator-shell.md`
- `docs/plans/phase1-incident-feed-plan.md`
- `docs/plans/phase1-agent-incident-evidence-plan.md`
- `docs/plans/phase1-correlation-drilldown-plan.md`
- `docs/plans/phase1-timeline-replay-plan.md`
- `docs/plans/phase1-supervision-events-plan.md`
- `docs/adr/0001-phase1-stack.md`
- `notes/source-documents.md`

## Backend scaffold
- runtime: plain Node.js built-ins only
- frontend shell: React + TypeScript via Vite under `apps/web`
- workspace manager: pnpm 10.28.2
- storage: append-only local JSONL file at `data/prototype-store.jsonl`
- seed domain: 6 employee agents plus `team-lead`
- canonical employee ids:
  - `market-intel`
  - `product-pmf`
  - `tokenomics`
  - `protocol-engineering`
  - `app-engineering`
  - `growth-revenue`

## Setup and prerequisites
- Node.js baseline: `>=20.19.0` or `>=22.12.0`
- recommended Node.js baseline: `22.12+` LTS so Vite 7 / jsdom 28 stay inside one supported line
- pnpm is pinned at `10.28.2` via the root `packageManager` field
- Corepack ships with modern Node; if your Node install does not expose it, install/refresh it with `npm install --global corepack@latest`

### Bootstrap
From the repository root:

```bash
corepack enable pnpm
corepack prepare pnpm@10.28.2 --activate
pnpm --version
pnpm install
```

Expected `pnpm --version`: `10.28.2`

### Run
```bash
pnpm install
pnpm test:all
pnpm web:typecheck
pnpm web:build
pnpm backend:start
```

For local UI development, run the backend in one shell and the web shell in another:
```bash
pnpm backend:start
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm web:dev
```

Optional env:
- `PORT=3000`
- `METAVERSE_OFFICE_STORE_FILE=/absolute/path/prototype-store.jsonl`
- `VITE_API_BASE_URL=https://api.example.test` for the React shell when the backend also allows that origin via `CORS_ALLOWED_ORIGINS`; omit it to keep same-origin `/office`, `/agents`, `/incidents`, and `/correlations` requests, or keep using `VITE_DEV_PROXY_TARGET` for local Vite proxying
- `CORS_ALLOWED_ORIGINS=https://frontend.example.test,http://localhost:5173` for the backend; a comma-separated list of origins allowed to make cross-origin GET requests.

### API
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events`
- `GET /agents/:id/incidents?kind=&severity=&status=&correlation_id=&limit=&window=`
- `GET /agents/:id/interactions`
- `GET /agents/:id/workflow?limit=&window=`
- `GET /events`
- `GET /interactions`
- `GET /collectors/controller-snapshot`
- `GET /office/overview`
- `GET /timeline?window=&agent_id=&event_type=&severity=&correlation_id=&limit=`
- `GET /peer-watch/alerts?status=&target_agent_id=&agent_id=&watcher_agent_id=&observer_agent_id=&correlation_id=&severity=&limit=`
- `GET /incidents?kind=&agent_id=&severity=&status=&correlation_id=&limit=&window=`
- `GET /correlations/:correlation_id?limit=&window=`
- `GET /handoffs`
- `GET /reboots`
- `POST /events`
- `POST /heartbeats`
- `POST /collectors/controller-snapshot`

### Office overview notes
- `GET /office/overview` returns `generated_at`, `summary`, `zones`, `watch_edges`, and `agents`
- zone metadata is canonical and deterministic; the server does not invent layout data at request time
- `effective_severity` can rise to `yellow` or `orange` from `last_meaningful_output_at`
- staleness thresholds are `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- `red` remains event-driven only

### Agent detail read-model notes
- `GET /agents/:id` returns the current agent projection plus `latest_heartbeat`
- optional `limit` caps `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_incidents`, `recent_handoffs`, and `recent_reboots`
- `open_peer_watch_alerts` is derived from unresolved peer-watch evidence, not from raw historical `raised` events
- `recent_incidents` reuses the same normalized read-only incident feed semantics as `GET /incidents`, scoped to the requested agent

### Agent incident query notes
- `GET /agents/:id/incidents` stays read-only and applies the requested agent id as an implicit incident filter
- supported filters are `kind`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- the route returns `404` for unknown agent ids instead of an empty feed

### Agent workflow query notes
- `GET /agents/:id/workflow` is a read-only aggregate over `getAgentDetail`, agent-scoped incidents, agent-scoped interactions, and agent-scoped timeline replay
- `detail` stays backward-compatible with `GET /agents/:id`; the route does not add a stored workflow projection
- `window` defaults to `60m` and filters only the top-level `incidents`, `interactions`, and `timeline` slices
- when `limit` is present, it reuses existing per-slice semantics: `detail` applies the existing detail limit to its recent slices, and top-level `incidents`, `interactions`, and `timeline` each cap independently using their existing ordering
- `correlation_ids` are deduped from all returned top-level workflow slices for quick operator pivots
- `counterparty_agent_ids` are deduped from all returned top-level workflow slices: `incidents` and `timeline` contribute their `counterparty_agent_ids`, `interactions` contribute via `participant_agent_ids`, and the final workflow list excludes the focal agent id plus `team-lead`

### Interaction read-model notes
- `GET /interactions` and `GET /agents/:id/interactions` are read-only query surfaces derived from the existing append-only event log
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired start/completed events collapse into one interaction only when interaction type, `correlation_id`, and participant lineage all match
- when that lineage is ambiguous, the server returns single-event interaction records instead of guessing
- global interaction filters: `interaction_type`, `counterparty_agent_id`, `severity`, `correlation_id`, `limit`, `window`

### Timeline replay notes
- `GET /timeline` is a read-only replay slice over canonical events
- supported filters are `window`, `agent_id`, `event_type`, `severity`, `correlation_id`, and `limit`
- replay output stays chronological ascending
- when `limit` is present, the server chooses the newest matching events first and still returns them ascending
- timeline items include evidence refs, counterparties, and `source_kind`, so collector-derived activity/supervision flows through unchanged

### Peer-watch alert query notes
- `GET /peer-watch/alerts` stays read-only and derives its evidence view from canonical peer-watch events
- supported filters are `status`, `target_agent_id`, backward-compatible `agent_id`, `watcher_agent_id`, `observer_agent_id`, `correlation_id`, `severity`, and `limit`
- `status=open` returns only currently unresolved alerts; omit `status` to inspect the full alert event history

### Incident feed notes
- `GET /incidents` is a read-only operator feed derived from existing peer-watch alert, handoff, and reboot read models
- supported `kind` values are `peer_watch_alert`, `handoff`, and `reboot`
- supported filters are `kind`, `agent_id`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- output stays descending by `ts` so operators see the newest incident first
- incident items expose `incident_id`, `kind`, `ts`, `agent_id`, `actor_id`, `status`, `severity`, `summary`, `correlation_id`, `evidence_refs`, `counterparty_agent_ids`, and `source_kind`
- the feed does not add persisted incident records; it reuses the existing append-only event log and derived read models

### Correlation drill-down notes
- `GET /correlations/:correlation_id` is a read-only aggregate over existing incident, interaction, and timeline read models
- when `window` is present, it reuses the existing `Nm|Nh` filter format; when omitted, the drill-down keeps the full correlation history
- when `limit` is present, it caps `incidents`, `interactions`, and `timeline` individually using their existing ordering semantics; `incident_count`, `interaction_count`, and `event_count` remain the full filtered totals
- the response also exposes deduped `participant_agent_ids`, deduped `evidence_refs`, and `first_ts` / `last_ts` bounds for the full filtered correlation slice
- the route returns `404` when the `correlation_id` matches no incidents, interactions, or events

### Handoff and reboot read-model notes
- `GET /handoffs` and `GET /reboots` remain read-only derived views
- both derived shapes now carry `status`, `severity`, `source_kind`, and `counterparty_agent_ids` so the incident feed can normalize them without a parallel persistence layer

### Controlled write rule
Prototype writes require `x-actor-id: <agent_id>`.
This keeps employee writes self-scoped and reserves cross-agent supervision/handoff/reboot events for `team-lead`.

### Collector snapshot notes
- `POST /collectors/controller-snapshot` is lead-only and requires `x-actor-id: team-lead`
- `GET /collectors/controller-snapshot` is read-only and returns the latest in-memory collector report
- collector heartbeats are derived from real `inbox.md`, `outbox.md`, `todo.md` mtimes plus tmux pane metadata
- collector-derived supervision reuses canonical `peer_watch_alert_raised` / `peer_watch_alert_resolved`
- collector snapshots also append deduped canonical `agent_state_changed` and `agent_wrote_file` events when evidence shows a new state or a newer file write
- yellow/orange staleness comes from `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- blocked or reboot-recommended collector items append evidence-backed peer-watch alerts with collector metadata
- repeated unchanged snapshots do not append duplicate activity or alert events; cleared conditions append resolved alerts
- collector-derived peer-watch events do not fabricate `red` from time alone
- tests stay hermetic by injecting filesystem/tmux observations instead of touching the live Hermes workspace
- existing `/events`, `/timeline`, `/peer-watch/alerts`, and agent projections now reflect collector-driven supervision and activity events


### React operator shell notes
- `apps/web` is the first living office surface for Phase 1 and stays strictly evidence-first
- the shell consumes `GET /office/overview`, `GET /agents/:id/workflow?limit=&window=`, `GET /incidents?limit=&window=`, and `GET /correlations/:correlation_id?limit=&window=` only
- API calls are same-origin by default; cross-origin `VITE_API_BASE_URL` deployment requires the backend to allow that frontend origin via `CORS_ALLOWED_ORIGINS`, and local development may still proxy `/office`, `/agents`, `/incidents`, and `/correlations` through Vite via `VITE_DEV_PROXY_TARGET`
- workflow and incident surfaces can open correlation drill-down without introducing a new backend contract or write path
- the shell polls every 15 seconds and must surface explicit loading, empty, and error states instead of inventing motion or liveness
- once overview, workflow, incident, or correlation data has loaded successfully, later refresh failures keep the last-good surface visible with an explicit degraded-refresh notice
