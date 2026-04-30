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
- timeline replay slices now support evidence-first filtering by agent, exact event id, event type, severity, correlation, and recent slice limit
- operator incident feed now exposes a descending read-only view over peer-watch alerts, handoffs, and reboots without adding new persistence
- correlation drill-down now exposes one read-only evidence/replay surface per `correlation_id` by aggregating existing incident, interaction, and timeline read models
- agent detail and agent-scoped incident queries now expose recent incident evidence by reusing the same read-only incident feed semantics
- agent workflow query now exposes one read-only operator slice per agent by aggregating existing detail, incident, interaction, and timeline read models
- office operations query now exposes the first live-operations queue by deriving active work from the existing append-only events, heartbeats, and agent projections
- shared memory artifact index now exposes a read-only engineering memory surface over evidence refs and collector observations so operators can inspect what workspace/tmux artifacts are anchoring the office state without relying on markdown dumps
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
pnpm --filter @metaverse-office/web install:browsers
```

Expected `pnpm --version`: `10.28.2`

Fresh Linux CI runners should use:

```bash
pnpm --filter @metaverse-office/web install:browsers:ci
```

That installs the Chromium browser used by the smoke suite. The Playwright checks here only prove the Chromium path.

### Run
```bash
pnpm install
pnpm test:all
pnpm web:typecheck
pnpm web:build
pnpm web:test:browser-smoke
pnpm web:test:browser-smoke:dev
pnpm backend:start
```

`pnpm web:test:browser-smoke` runs the Playwright smoke bundle from the repository root (currently the keyboard smoke plus the active-queue smoke), starts its own hermetic read-only backend seeded under `./.tmp/browser-smoke`, starts its own Vite shell on ephemeral localhost ports, and passes the resolved base URL into Playwright so stale orphaned processes do not block startup.

`pnpm web:test:browser-smoke:dev` runs the same Playwright smoke bundle through the wrapper with `BROWSER_SMOKE_FRONTEND_MODE=dev`, so CI also proves the non-preview Vite path end-to-end instead of only covering that branch in helper tests.

For local UI development, run the backend in one shell and the web shell in another:
```bash
pnpm backend:start
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm web:dev
```

For the browser smoke against your own local backend data instead of the hermetic seed, keep that backend running and execute the package-level command directly:
```bash
cd apps/web
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm test:browser-smoke
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm test:browser-smoke:dev
```

Optional env:
- `PORT=3000`
- `METAVERSE_OFFICE_STORE_FILE=/absolute/path/prototype-store.jsonl`
- `BROWSER_SMOKE_FRONTEND_MODE=dev` to run the smoke wrapper against a managed Vite dev server instead of the preview build; omit it to keep the preview-mode smoke path
- `BROWSER_SMOKE_BACKEND_PORT=3210` to pin the hermetic backend port for browser smoke while still letting the wrapper auto-select a free Vite port unless you also pin `BROWSER_SMOKE_DEV_SERVER_PORT`
- `BROWSER_SMOKE_DEV_SERVER_PORT=4173` to pin the Vite dev-server port for browser smoke while still letting the wrapper auto-select a free hermetic backend port unless you also pin `BROWSER_SMOKE_BACKEND_PORT`
- `VITE_API_BASE_URL=https://api.example.test` for the React shell when the backend also allows that origin via `CORS_ALLOWED_ORIGINS`; omit it to keep same-origin `/office`, `/agents`, `/incidents`, `/timeline`, `/collectors`, and `/correlations` requests, or keep using `VITE_DEV_PROXY_TARGET` for local Vite proxying
- `CORS_ALLOWED_ORIGINS=https://frontend.example.test,http://localhost:5173` for the backend; a comma-separated list of origins allowed to make cross-origin GET requests.

### API
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events?limit=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=`
- `GET /agents/:id/incidents?kind=&severity=&status=&correlation_id=&limit=&window=`
- `GET /agents/:id/interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /agents/:id/workflow?limit=&window=`
- `GET /events?event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /collectors/controller-snapshot`
- `GET /collectors/controller-snapshot/evidence-coverage?agent_id=&source_kind=&confidence_level=&limit=`
- `GET /office/overview`
- `GET /office/operations?limit=&state=&agent_id=&severity=`
- `GET /timeline?window=&event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /peer-watch/alerts?status=&target_agent_id=&agent_id=&watcher_agent_id=&observer_agent_id=&correlation_id=&severity=&limit=`
- `GET /incidents?kind=&agent_id=&severity=&status=&correlation_id=&limit=&window=`
- `GET /correlations/:correlation_id?limit=&window=`
- `GET /memory/artifacts?limit=&window=&agent_id=&correlation_id=&artifact_ref=&event_type=&severity=&source_kind=&artifact_kind=`
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

### Office operations notes
- `GET /office/operations` is a read-only live-operations queue derived from the existing append-only events, heartbeats, and current agent projections
- default output includes only currently active agents: `current_state` is neither `idle` nor `sleeping`
- optional `agent_id` narrows the queue to one agent before the existing state/severity/limit handling; optional `state` filters the queue by one canonical `current_state`; optional `severity` exact-matches derived `effective_severity` (`normal`, `yellow`, `orange`, `red`) after state handling and before `limit`; optional `limit` caps the returned queue after sorting
- queue items reuse the existing projection plus `reported_severity`, `derived_staleness`, and `effective_severity` from the overview logic
- `correlation_id` and `latest_event` come from the latest event for that agent when one exists; heartbeats do not fabricate them
- summary fields describe the returned queue slice: `item_count`, `blocked_count`, `reboot_recommended_count`, `state_buckets`, and `severity_buckets`

### Agent detail read-model notes
- `GET /agents/:id` returns the current agent projection plus `latest_heartbeat`
- optional `limit` caps `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_incidents`, `recent_handoffs`, and `recent_reboots`
- `open_peer_watch_alerts` is derived from unresolved peer-watch evidence, not from raw historical `raised` events
- `recent_incidents` reuses the same normalized read-only incident feed semantics as `GET /incidents`, scoped to the requested agent

### Event query notes
- `GET /events` and `GET /agents/:id/events` are read-only event-log slices
- `evidence_ref` exact-matches membership in `event.evidence_refs`; blank or missing values keep existing behavior
- `GET /agents/:id/events` keeps returning `404` for unknown agent ids

### Agent incident query notes
- `GET /agents/:id/incidents` stays read-only and applies the requested agent id as an implicit incident filter
- supported filters are `kind`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- `status=open` follows the same active-status alias semantics as `GET /incidents`
- the route returns `404` for unknown agent ids instead of an empty feed

### Agent workflow query notes
- `GET /agents/:id/workflow` is a read-only aggregate over `getAgentDetail`, agent-scoped incidents, agent-scoped interactions, and agent-scoped timeline replay
- `detail` stays backward-compatible with `GET /agents/:id`; the route does not add a stored workflow projection
- `window` defaults to `60m` and filters only the top-level `incidents`, `interactions`, and `timeline` slices
- when `limit` is present, it reuses existing per-slice semantics: `detail` applies the existing detail limit to its recent slices, and top-level `incidents`, `interactions`, and `timeline` each cap independently using their existing ordering
- `summary` is derived only from the returned top-level workflow slices, so its counts, buckets, and `latest_activity_at` reflect the already windowed/limited response rather than hidden history
- `correlation_ids` are deduped from all returned top-level workflow slices for quick operator pivots
- `counterparty_agent_ids` are deduped from all returned top-level workflow slices: `incidents` and `timeline` contribute their `counterparty_agent_ids`, `interactions` contribute via `participant_agent_ids`, and the final workflow list excludes the focal agent id plus `team-lead`

### Interaction read-model notes
- `GET /interactions` and `GET /agents/:id/interactions` are read-only query surfaces derived from the existing append-only event log
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired start/completed events collapse into one interaction only when interaction type, `correlation_id`, and participant lineage all match
- when that lineage is ambiguous, the server returns single-event interaction records instead of guessing
- global interaction filters: `event_id`, `evidence_ref`, `interaction_type`, `counterparty_agent_id`, `severity`, `correlation_id`, `limit`, `window`; agent-scoped interaction reads support the same filters with `:id` as an implicit participant filter
- `event_id` exact-matches the interaction `trigger_event_id` or any `related_event_ids` member; `evidence_ref` exact-matches membership in the interaction `evidence_refs` rollup

### Timeline replay notes
- `GET /timeline` is a read-only replay slice over canonical events
- supported filters are `window`, `event_id`, `agent_id`, `event_type`, `severity`, `source_kind`, `evidence_ref`, `correlation_id`, and `limit`
- `source_kind` is a read-only exact-match provenance filter over `event.source_kind`
- `evidence_ref` exact-matches membership in `event.evidence_refs`
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
- `status=open` is an active-status alias: unresolved peer-watch `open`, handoff `waiting` / `started`, and reboot `waiting` / `started` / `requested`
- explicit closed status filters such as `status=completed` and `status=resolved` remain literal matches
- incident items expose `incident_id`, `kind`, `ts`, `agent_id`, `actor_id`, `status`, `severity`, `summary`, `correlation_id`, `evidence_refs`, `counterparty_agent_ids`, and `source_kind`
- the feed does not add persisted incident records; it reuses the existing append-only event log and derived read models

### Correlation drill-down notes
- `GET /correlations/:correlation_id` is a read-only aggregate over existing incident, interaction, and timeline read models
- when `window` is present, it reuses the existing `Nm|Nh` filter format; when omitted, the drill-down keeps the full correlation history
- when `limit` is present, it caps `incidents`, `interactions`, `timeline`, and the additive `closure_ledger.entries` slice using their existing newest-first/reader ordering semantics; `incident_count`, `interaction_count`, `event_count`, and closure ledger counts remain the full filtered totals
- the response also exposes deduped `participant_agent_ids`, deduped `evidence_refs`, `first_ts` / `last_ts` bounds, and an additive `closure_ledger` for the full filtered correlation slice
- `closure_ledger.state` is derived from current `status=open` incident semantics first, then active interactions, then closed resolved/completed incidents; it does not treat completed handoff/reboot start rows as open
- the route returns `404` when the `correlation_id` matches no incidents, interactions, or events

### Shared memory artifact notes
- `GET /memory/artifacts` is a read-only engineering memory surface derived from existing event `evidence_refs` plus the latest collector workspace/tmux observations when available
- supported filters are `window`, `agent_id`, `correlation_id`, `artifact_ref`, `event_type`, `severity`, `source_kind`, `artifact_kind`, and `limit`
- event facet filters keep collector observations as extensions of matching event-backed artifacts, but do not surface unrelated collector-only artifacts
- `source_kind` exact-matches membership in the artifact `source_kinds` rollup before `limit`; multi-source matches keep the existing full artifact response instead of narrowing contribution fields
- the route does not introduce a markdown-backed status store, write path, or separate task system; it materializes shared memory from the existing append-only evidence trail
- items expose `artifact_ref`, `artifact_kind`, `file_name`, `first_seen_at`, `last_seen_at`, `mention_count`, `agent_ids`, `correlation_ids`, `source_kinds`, `latest_summary`, `latest_event_type`, optional `latest_event_id`, optional `replay_checkpoint`, and optional `collector_last_modified_at`
- event-backed artifacts derive `replay_checkpoint` from the true latest event anchor; collector-only observations omit it instead of fabricating replay evidence
- ordering is operational: newest `last_seen_at` first, then higher `mention_count`, then stable `artifact_ref`

### Handoff and reboot read-model notes
- `GET /handoffs` and `GET /reboots` remain read-only derived views
- both derived shapes now carry `status`, `severity`, `source_kind`, and `counterparty_agent_ids` so the incident feed can normalize them without a parallel persistence layer

### Controlled write rule
Prototype writes require `x-actor-id: <agent_id>`.
This keeps employee writes self-scoped and reserves cross-agent task dispatch plus review/meeting/supervision/handoff/reboot events for `team-lead`.
`agent_received_task` stays visible through the existing event/read surfaces but does not advance `last_meaningful_output_at` by itself.

### Collector snapshot notes
- `POST /collectors/controller-snapshot` is lead-only and requires `x-actor-id: team-lead`
- `GET /collectors/controller-snapshot` is read-only and returns the latest in-memory collector report
- `GET /collectors/controller-snapshot/evidence-coverage` is read-only and returns `{ "item": null }` until the latest in-memory collector report includes `evidence_coverage`
- evidence coverage can be filtered by exact `agent_id`, collector evidence `source_kind`, `confidence_level`, and post-filter `limit`; blank filters are ignored and invalid limits use the existing read-model default
- evidence coverage responses include only `collected_at`, `actor_id`, aggregate coverage counts, source-kind buckets, low-confidence agent ids, and bounded `agent_items`; the route does not touch tmux, the filesystem, or collector write paths
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
- the shell consumes `GET /office/overview`, `GET /office/operations?limit=&state=&agent_id=&severity=`, `GET /agents/:id/workflow?limit=&window=`, `GET /incidents?limit=&window=`, `GET /timeline?limit=&window=`, `GET /collectors/controller-snapshot`, and `GET /correlations/:correlation_id?limit=&window=` only
- API calls are same-origin by default; cross-origin `VITE_API_BASE_URL` deployment requires the backend to allow that frontend origin via `CORS_ALLOWED_ORIGINS`, and local development may still proxy `/office`, `/agents`, `/incidents`, `/timeline`, `/correlations`, and `/collectors` through Vite via `VITE_DEV_PROXY_TARGET`
- workflow and incident surfaces can open correlation drill-down without introducing a new backend contract or write path
- workflow counterparties, correlation participants, and incident agent ids remain read-only but are directly selectable so operators can pivot into another agent workflow from the current evidence surface
- the shell polls every 15 seconds and must surface explicit loading, empty, and error states instead of inventing motion or liveness
- once overview, workflow, incident, or correlation data has loaded successfully, later refresh failures keep the last-good surface visible with an explicit degraded-refresh notice
