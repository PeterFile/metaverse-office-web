# Metaverse Office Web

Updated: 2026-05-15T10:14:43+08:00

This repository is the implementation home for the Hermes-Agent metaverse-office project.

## Current direction
Metaverse Office Web is a live evidence spine and operator world for a real Hermes-agent company. The product goal is to make multi-agent work observable, replayable, and accountable: who is active, what they are doing, why the system thinks they are blocked or degraded, and which session/task/file/tmux evidence proves it. It is not a flashy dashboard, not a manual task-dispatch UI, and not a Kanban control plane.

The next product milestone is `Live Evidence Spine`: connect the current read models and AI Town UI to real Hermes team runtime facts, then persist those facts in a stronger append-only event store with stable provenance. See `docs/current-direction.md`.

## Project rules
- repo root can live in any checkout path; docs and scripts must not require a contributor-specific absolute root
- current product direction is tracked in `docs/current-direction.md`; Phase 1 documents are historical archive unless explicitly cited by that document
- evidence-first is still mandatory: no fake productivity, no fabricated liveness, no decorative motion presented as work
- UI work must not outrun event/state/storage/query architecture or its documentation
- every PR that changes product behavior, API contracts, storage semantics, event schemas, runtime ingestion, or operator workflows must update the relevant docs in the same change
- no task-dispatch/control-plane semantics inside this repo unless a current-direction/spec update explicitly changes that boundary
- no token layer or onchain dependency unless a current-direction/spec update explicitly introduces it

## Current implementation snapshot
- backend exposes evidence-first read models for office overview, operations, agent workflow/detail, incidents, timeline replay, accountability replay, correlation drill-down, shared memory artifacts, peer-watch alerts, handoffs, reboots, and collector evidence coverage
- controlled writes remain limited to `POST /events`, `POST /heartbeats`, and `POST /collectors/controller-snapshot`
- storage defaults to the local append-only JSONL prototype at `data/prototype-store.jsonl`, replayed into memory; an opt-in SQLite append-only backend can store the same canonical record stream at `data/prototype-store.sqlite` with idempotently backfilled derived sidecar indexes for evidence lookup
- domain still uses the canonical seven-actor office model: six employee agents plus `team-lead`
- frontend is a React + TypeScript + PixiJS AI Town operator world with roster, category Hub, selected-agent drilldowns, supervision/evidence/replay/memory surfaces, mapped source-gap world-pin inspect peeks, and real browser smoke coverage

## Key documents
- `docs/current-direction.md` — current vision, implementation facts, next milestone, and documentation discipline
- `specs/api-contract.md` — current API/read-model contract; update when routes or semantics change
- `docs/runbooks/hermes-runtime-source-onboarding.md` — sanitized Hermes runtime source onboarding contract and validation runbook
- `README.md` — setup, API index, and current implementation snapshot
- `docs/adr/0002-react-operator-shell.md` and `docs/adr/0003-hub-openhub-hud-visual-acceptance.md` — active UI architecture decisions
- `specs/phase1-spec.md`, `docs/plans/phase1-*.md`, and `docs/adr/0001-phase1-stack.md` — historical Phase 1 archive, not the current roadmap
- `notes/source-documents.md`

## Current backend and frontend scaffold
- runtime: plain Node.js built-ins only
- frontend shell: React + TypeScript via Vite under `apps/web`
- workspace manager: pnpm 10.28.2
- storage: append-only local JSONL file at `data/prototype-store.jsonl` by default; opt-in SQLite uses the local `sqlite3` CLI and keeps `records` canonical while maintaining idempotently backfilled derived lookup sidecars for evidence/source/time queries
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
- SQLite storage is opt-in and requires the `sqlite3` CLI on `PATH`, or `METAVERSE_OFFICE_SQLITE_BIN` pointing at the binary.

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
pnpm web:test:browser-smoke:live-evidence
pnpm web:test:browser-smoke:dev
pnpm verify:quick -- --lane=<docs|backend|web-api|ui|smoke>
pnpm backend:start
```

`pnpm verify:quick -- --lane=<lane>` runs `git diff --check` plus a narrow existing validation path: `docs` checks only whitespace/conflict markers, `backend` adds backend tests, `web-api` adds focused API contract Vitest and web typecheck, `ui` adds focused App/DetailsPanel/WorldScene/source-gap/source-health Vitest when those tests exist plus web typecheck, and `smoke` adds the live-evidence browser smoke.

`pnpm web:test:browser-smoke` runs the Playwright smoke bundle from the repository root (currently the keyboard, active-queue, and layout-visual smokes), starts its own hermetic read-only backend seeded under `./.tmp/browser-smoke`, starts its own Vite shell on ephemeral localhost ports, and passes the resolved base URL into Playwright so stale orphaned processes do not block startup.

`pnpm web:test:browser-smoke:live-evidence` runs only the short Live Evidence journey smoke through the same hermetic wrapper. Use it for focused validation when the changed surface is limited to the live evidence journey; it does not replace the full smoke bundle for broad shell changes.

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
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm test:browser-smoke:live-evidence
VITE_DEV_PROXY_TARGET=http://127.0.0.1:3000 pnpm test:browser-smoke:dev
```

Optional env:
- `PORT=3000`
- `METAVERSE_OFFICE_STORE_FILE=/absolute/path/prototype-store.jsonl`
- `METAVERSE_OFFICE_STORE_BACKEND=sqlite` to use SQLite instead of JSONL; unknown values fail startup
- `METAVERSE_OFFICE_SQLITE_STORE_FILE=/absolute/path/prototype-store.sqlite`; setting this also opts into SQLite
- `METAVERSE_OFFICE_SQLITE_BIN=/absolute/path/sqlite3` to override the SQLite CLI binary; missing binaries fail startup without falling back to JSONL
- `BROWSER_SMOKE_FRONTEND_MODE=dev` to run the smoke wrapper against a managed Vite dev server instead of the preview build; omit it to keep the preview-mode smoke path
- `BROWSER_SMOKE_BACKEND_PORT=3210` to pin the hermetic backend port for browser smoke while still letting the wrapper auto-select a free Vite port unless you also pin `BROWSER_SMOKE_DEV_SERVER_PORT`
- `BROWSER_SMOKE_DEV_SERVER_PORT=4173` to pin the Vite dev-server port for browser smoke while still letting the wrapper auto-select a free hermetic backend port unless you also pin `BROWSER_SMOKE_BACKEND_PORT`
- `VITE_API_BASE_URL=https://api.example.test` for the React shell when the backend also allows that origin via `CORS_ALLOWED_ORIGINS`; omit it to keep same-origin read requests, or keep using `VITE_DEV_PROXY_TARGET` for local Vite proxying
- `CORS_ALLOWED_ORIGINS=https://frontend.example.test,http://localhost:5173` for the backend; a comma-separated list of origins allowed to make cross-origin GET requests.

### API
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events?limit=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=`
- `GET /agents/:id/incidents?kind=&severity=&status=&correlation_id=&limit=&window=`
- `GET /agents/:id/interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /agents/:id/workflow?limit=&window=`
- `GET /agents/:id/evidence-spine?source_kind=&evidence_role=&output_candidate=&source_status=&status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /events?event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /collectors/controller-snapshot`
- `GET /collectors/controller-snapshot/evidence-coverage?agent_id=&source_kind=&confidence_level=&limit=`
- `GET /collectors/controller-snapshot/source-health?collector_snapshot_id=&agent_id=&source_kind=&status=&limit=`
- `GET /collectors/controller-snapshot/history?collector_snapshot_id=&agent_id=&source_kind=&status=&collected_since=&collected_until=&limit=`
- `GET /collectors/controller-snapshot/diff?from_collector_snapshot_id=&to_collector_snapshot_id=&from=&to=&limit=`
- `GET /evidence-records?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/facets?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/ref-rollup?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/:evidence_id`
- `GET /evidence-records/:evidence_id/provenance-bundle`
- `GET /runtime/source-gaps?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/agent-summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/lifecycle?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/trend?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&bucket=&limit=`
- `GET /office/overview`
- `GET /office/operations?limit=&state=&agent_id=&severity=`
- `GET /timeline?window=&event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /accountability/replay?event_id=&evidence_id=&evidence_ref=&correlation_id=&agent_id=&source_kind=&artifact_kind=&limit=&window=`
- `GET /accountability/replay/checkpoint-summary`
- `GET /accountability/replay/checkpoint-log?limit=&record_kind=&evidence_id=&collector_snapshot_id=&correlation_id=&source_kind=`
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

### Agent evidence spine query notes
- `GET /agents/:id/evidence-spine` is a read-only aggregate over existing replayed evidence-record summaries, runtime source-gap projections, and collector source-health projections for one known agent; unknown agents return `404`
- filters are exact and additive: `source_kind`, `evidence_role`, `output_candidate`, `source_status` (or `status` for source-health aliasing), `collector_snapshot_id`, `correlation_id`, `mapped`, inclusive observed/collected windows, `newest_first`, and post-filter `limit`
- `evidence_summary` and `source_gaps.summary` compute counts, buckets, and extrema before `limit`; `recent_evidence`, `source_gaps.items`, and `source_health.agent_items` are bounded after filters by `returned_limit`
- the route returns bounded source/status/role/count/time fields only and does not expose raw evidence refs, local paths, tmux/Hermes/session/profile refs, payloads, metadata, degraded reasons, liveness/productivity/severity inference, collection, filesystem/tmux reads, writes, or control-plane actions

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

### Accountability replay notes
- `GET /accountability/replay` is a bounded read-only bundle over existing event, interaction, and shared-memory artifact read models
- at least one anchor is required: `event_id`, `evidence_id`, `evidence_ref`, `correlation_id`, or `agent_id`; missing all anchors returns `400 missing_replay_anchor`
- optional `source_kind` and `artifact_kind` are read-only facets over the existing replay read models; `source_kind` narrows events/timeline and memory artifacts, while `artifact_kind` narrows memory artifacts
- `limit` and `window` bound every returned slice; missing values default to `limit=10` and `window=60m`
- the response includes `accountability` rollups, chronological `ledger` entries, `events`, `interactions`, and `memory_artifacts`
- `evidence_id` requests include sanitized `replay_audit` status (`event_backed`, `collector_only`, or `unknown_evidence_id`) with bounded returned counts and anchor event ids only from existing ledger `basis_event_ids`
- ledger `basis_event_ids` cite only existing event ids; collector-only artifacts remain marked as `collector_observation_without_event_id` and do not fabricate replay checkpoints
- the web Evidence Record Detail view may open this route with `evidence_id` only when the provenance bundle exposes a replay anchor for that evidence id; collector-only evidence remains labelled non-replayable
- the route does not add a write path, storage table, command dispatch path, or collector filesystem/tmux read
- `GET /accountability/replay/checkpoint-summary` returns a sanitized append-order checkpoint over replayed records, with record/count buckets and latest bounded anchors for events, heartbeats, evidence records, and collector snapshots; it does not return evidence record ids derived from raw refs, raw evidence refs, paths, summaries, metadata, payloads, degraded reasons, or trigger collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /accountability/replay/checkpoint-log?limit=&record_kind=&evidence_id=&collector_snapshot_id=&correlation_id=&source_kind=` returns newest append-order checkpoint rows as `{ "items": [{ "append_index": number, "record_kind": string, "checkpoint": object|null }] }`; optional non-blank `record_kind`, `evidence_id`, `collector_snapshot_id`, `correlation_id`, and `source_kind` exact-match replayed records before limit, unknown values return empty `items`, and rows use the same sanitized event, heartbeat, evidence-record, and collector-snapshot checkpoint shapes as the summary and omit raw evidence ids, refs, paths, payloads, metadata, degraded reasons, collector reads, writes, and control-plane actions

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
- `GET /collectors/controller-snapshot` is read-only and returns the latest replayed collector report
- `GET /collectors/controller-snapshot/evidence-coverage` is read-only and returns `{ "item": null }` until the latest replayed collector report includes `evidence_coverage`
- `GET /collectors/controller-snapshot/source-health` is read-only and returns `{ "item": null }` until a latest collector report exists; with `collector_snapshot_id`, it projects that exact replayed snapshot and returns `{ "item": null }` for unknown ids instead of falling back to latest
- `GET /collectors/controller-snapshot/history` is a bounded read-only summary over replayed collector snapshots; it supports exact `collector_snapshot_id`, `agent_id`, source-health `source_kind`, source-health `status`, inclusive valid-ISO `collected_since`/`collected_until`, and post-filter `limit`, and returns compact per-snapshot counts without raw snapshot `items`, runtime payloads, paths, refs, or heartbeat payloads
- `GET /collectors/controller-snapshot/diff` is a compact read-only latest-vs-previous snapshot delta, or explicit `from_collector_snapshot_id`/`to_collector_snapshot_id` (`from`/`to` aliases); it returns only snapshot ids/timestamps, summary deltas, source-health bucket deltas, and bounded agent-level change flags/status transitions, without raw items, paths, tmux refs, evidence refs, metadata, payloads, task dispatch, writable Kanban, routing, orchestration, liveness/productivity, or severity claims
- `POST /collectors/controller-snapshot` stores internal `evidence_record` JSONL records after derived event/heartbeat records and before the `collector_snapshot` record; replay uses only the latest snapshot record for the latest collector report, replays evidence records for collector source facts including missing/error expected workspace files, and counts only `event`/`heartbeat` records as events/heartbeats
- collector evidence records capture workspace roots, workspace files, mapped tmux panes, mapped Hermes profile/session presence, and unmapped tmux/Hermes runtime evidence with source kind, evidence role, source status, output-candidate classification, collector correlation, and degraded reasons
- task evidence records are projected only from allowlisted fixture facts (`kanban_fixture`, `linear_fixture`, `slack_fixture`, `task_fixture`) into the same canonical `evidence_record` shape, using `task://<source_kind>/<task_ref>` refs, `evidence_role: task_reference`, and `output_candidate: false`; facts with claim/complete/assign/dispatch/route/writeback/mutate control fields are rejected, and this does not add live task ingestion, writeback, task dispatch, profile routing, Kanban controls, or raw payload/path/secret exposure
- evidence records can be queried through `GET /evidence-records`; it returns `{ "items": [...] }`, supports exact `evidence_id`, `agent_id`, `source_kind`, `evidence_role`, `output_candidate`, `evidence_ref`, `source_status`, `collector_snapshot_id`, `correlation_id`, optional `mapped=true|false`, inclusive valid-ISO `observed_since`/`observed_until` and `collected_since`/`collected_until` windows, optional `newest_first=true`, and post-filter `limit`, ignores blank filters, invalid `mapped`, and invalid timestamp filters, returns an empty `items` array for unknown exact values or contradictory filters such as `mapped=false&agent_id=app-engineering`, orders `newest_first=true` by `observed_at` descending, then `collected_at` descending, then a deterministic persisted-field tie key, and uses the existing default/max limit behavior
- evidence records can be deep-linked through `GET /evidence-records/:evidence_id`; it returns `{ "item": evidence_record }` using the same record shape as list items, returns `404` with `error: "not_found"` for unknown ids, and does not shadow `GET /evidence-records/summary`
- evidence record provenance can be inspected through `GET /evidence-records/:evidence_id/provenance-bundle`; it returns bounded record fields plus `source_summary` (`kind`, `status`, `role`, `output_candidate`, `mapped`, and observed/collected timestamps; unknown or unsafe source enum values and invalid/unsafe timestamps are `null` rather than echoed) and nullable snapshot/source/replay anchors, but must not expose raw evidence refs, snapshot ids or correlation ids inside `source_summary`, metadata, degraded reasons, local paths, tmux/Hermes/session/profile refs, tokens, webhooks, payload text, or control-plane actions
- evidence records can expose safe facets through `GET /evidence-records/facets` with the same filters; it returns only `total_count`, `returned_limit`, and stable count buckets for `source_kind`, `evidence_role`, `source_status`, `output_candidate`, mapped/unmapped, and seeded agent ids plus `unmapped`; it computes buckets before `limit`, ignores unknown or unsafe historical bucket values instead of echoing them as response keys, and does not return raw evidence rows, ids, refs, metadata, degraded arrays, paths, tmux refs, payloads, or trigger collection, filesystem/tmux reads, writes, or control-plane actions
- evidence records can be summarized through `GET /evidence-records/summary` with the same filters; it returns `{ "item": { "total_count": number, "returned_limit": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": { "true": number, "false": number }, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "collector_snapshot_id_buckets": object, "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null } }`, computes counts and extrema before `limit`, exposes the parsed `returned_limit`, keeps stable zero-valued bucket keys for empty matches, and does not return raw evidence payloads, evidence ids, refs, metadata, or degraded arrays
- `GET /runtime/source-gaps` is a compact read-only feed over replayed evidence records; it accepts the same exact/time/mapped filters except raw `evidence_ref`, returns only missing/degraded/error source rows plus observed unmapped runtime evidence, omits evidence ids, raw evidence refs, metadata, and degraded reason arrays, and does not trigger collection, tmux/filesystem reads, append-only writes, incident/severity/liveness escalation, or control-plane actions
- `GET /runtime/source-gaps/summary` is the compact read-only bucket summary over the same filtered source-gap set; it accepts the same filters as `GET /runtime/source-gaps`, returns `{ "item": { "total_count": number, "returned_limit": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": { "true": number, "false": number }, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "collector_snapshot_id_buckets": object, "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null } }`, computes counts and lifecycle extrema before `limit`, and never returns evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, or Hermes payloads
- `GET /runtime/source-gaps/agent-summary` is the compact read-only grouping surface over the same filtered source-gap set; it accepts the same filters as `GET /runtime/source-gaps`, groups by `agent_id` and `source_kind`, returns only `total_count`, `total_groups`, `returned_limit`, and bounded group rows with counts, lifecycle extrema, `output_candidate`, `evidence_role`, and `source_status` buckets, keeps literal seeded or stored agent ids distinct from `agent_id: null` unmapped groups, computes groups before `limit`, and never returns evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, or triggers collection, tmux/filesystem reads, append-only writes, incident/severity/liveness escalation, or control-plane actions
- `GET /runtime/source-gaps/lifecycle` is the compact read-only lifecycle grouping surface over filtered evidence records; it accepts the same filters as `GET /runtime/source-gaps`, returns only groups that have a source-gap signal, groups by `agent_id`, `source_kind`, and `evidence_role`, reports `current_status`, `lifecycle_state` (`opened`, `continuing`, `resolved`, or `observed_unmapped`), first/last observed and collected times, `snapshot_count`, and safe `source_status` buckets, computes groups before `limit`, and never returns collector snapshot ids, evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, liveness/productivity/severity inference, or control-plane actions
- `GET /runtime/source-gaps/trend` is the compact read-only trend surface over the same filtered source-gap set; it accepts the same filters as `GET /runtime/source-gaps` plus `bucket=hour|day`, returns only count buckets by `bucket_start`, computes buckets before `limit`, and never returns agent ids, collector snapshot ids, evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, liveness/productivity/severity inference, or control-plane actions
- evidence-record time-window filters run before `newest_first` and `limit`; records without `observed_at` do not match observed windows, and records without `collected_at` do not match collected windows
- `GET /evidence-records` is read-only and does not trigger collection, tmux/filesystem reads, append-only writes, write APIs, control-plane actions, UI work, or SQLite work; missing/error expected workspace-file rows and unmapped tmux/Hermes rows stay visible with `output_candidate: false`
- evidence coverage can be filtered by exact `agent_id`, collector evidence `source_kind`, `confidence_level`, and post-filter `limit`; blank filters are ignored and invalid limits use the existing read-model default
- evidence coverage responses include only `collected_at`, top-level `collector_snapshot_id`, `actor_id`, aggregate coverage counts, source-kind buckets, low-confidence agent ids, and bounded `agent_items`; the route does not touch tmux, the filesystem, or collector write paths
- source health can be filtered by exact `collector_snapshot_id`, `agent_id`, `source_kind`, `status`, and post-filter `limit`; accepted `source_kind` values are `workspace_root`, `workspace_file`, `workspace_files`, `tmux_observation`, `tmux_session`, `hermes_profile`, and `hermes_session`
- source health responses include `collected_at`, top-level `collector_snapshot_id`, `actor_id`, summary source/status buckets, bounded agent rows with the same sanitized `collector_snapshot_id`, projected source-health status/time/count fields, `evidence_ref_count`, and `latest_evidence_at`, plus sanitized `runtime_source_evidence.unmapped_tmux_sessions` and `runtime_source_evidence.unmapped_hermes_sources` when present; the route does not return raw paths, tmux/Hermes/session/profile refs, evidence refs, metadata, degraded reason arrays, or touch tmux, the filesystem, or collector write paths
- collector heartbeats keep coverage for real `inbox.md`, `outbox.md`, `todo.md` mtimes plus tmux pane metadata, but only agent-output files (`outbox.md`, `todo.md`, and legacy non-inbox workspace files) or tmux runtime evidence advance meaningful-output/file-write state
- collector items include additive `source_health` for `workspace_root`, workspace files, the expected `tmux_session`, and Hermes profile/session runtime sources when enabled; missing sessions are reported with the expected `session_ref`
- Hermes runtime file ingestion is opt-in via `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS` for `path.delimiter`-separated files/directories or legacy `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE` for one file; unset keeps existing empty behavior, `PATHS` takes precedence over `FILE`, directories read local `.json`/`.jsonl` files only, and missing/unreadable or invalid input fails collection before append without exposing local input paths or raw input snippets in error details
- collector reports include additive `runtime_source_evidence.unmapped_tmux_sessions` and `unmapped_hermes_sources` for observed runtime sources outside the seeded roster
- collector-derived supervision reuses canonical `peer_watch_alert_raised` / `peer_watch_alert_resolved`
- collector snapshots also append deduped canonical `agent_state_changed` and `agent_wrote_file` events when evidence shows a new state or a newer file write
- yellow/orange staleness comes from `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- blocked or reboot-recommended collector items append evidence-backed peer-watch alerts with collector metadata
- repeated unchanged snapshots do not append duplicate activity or alert events; cleared conditions append resolved alerts
- collector-derived peer-watch events do not fabricate `red` from time alone
- tests stay hermetic by injecting filesystem/tmux observations instead of touching the live Hermes workspace
- existing `/events`, `/timeline`, `/peer-watch/alerts`, and agent projections now reflect collector-driven supervision and activity events


### React operator shell notes
- `apps/web` is the current living office surface and stays strictly evidence-first; do not describe it as a Phase 1-only shell
- the shell consumes `GET /office/overview`, `GET /office/operations?limit=&state=&agent_id=&severity=`, `GET /agents/:id/workflow?limit=&window=`, `GET /incidents?limit=&window=`, `GET /timeline?limit=&window=`, `GET /collectors/controller-snapshot`, `GET /collectors/controller-snapshot/evidence-coverage`, `GET /collectors/controller-snapshot/source-health`, `GET /runtime/source-gaps?newest_first=&limit=`, `GET /runtime/source-gaps/summary?newest_first=&limit=`, `GET /evidence-records?agent_id=&newest_first=&limit=`, `GET /accountability/replay`, `GET /memory/artifacts`, `GET /peer-watch/alerts`, and `GET /correlations/:correlation_id?limit=&window=`
- the React API client also exposes `GET /runtime/source-gaps/agent-summary`, `GET /runtime/source-gaps/trend`, and `GET /runtime/source-gaps/lifecycle`; lifecycle is available as a bounded client helper but is not currently wired into the operator shell UI
- API calls are same-origin by default; cross-origin `VITE_API_BASE_URL` deployment requires the backend to allow that frontend origin via `CORS_ALLOWED_ORIGINS`, and local development may still proxy consumed read-route prefixes through Vite via `VITE_DEV_PROXY_TARGET`
- workflow and incident surfaces can open correlation drill-down without introducing a new backend contract or write path
- workflow counterparties, correlation participants, and incident agent ids remain read-only but are directly selectable so operators can pivot into another agent workflow from the current evidence surface
- the shell polls every 15 seconds and must surface explicit loading, empty, and error states instead of inventing motion or liveness
- HUD evidence coverage focus uses the collector evidence coverage read model and shows low-confidence or uncovered employee coverage without raw evidence refs or path metadata
- HUD source-gap focus uses the runtime source-gap read model and summary as a bounded queue; mapped gap chips can open the selected-agent source drilldown, while unmapped runtime sources stay non-clickable and must not expose local paths, tmux refs, Hermes payloads, or inferred liveness/productivity
- the Hub-closed selected-agent inspect peek shows a compact proof capsule plus mapped source-health/source-gap peek derived only from already loaded evidence coverage/source-health/runtime source-gap projections; mapped source-gap world pins can open the same Hub-closed evidence-only inspect peek while keeping unmapped runtime sources passive, and the Evidence Ledger CTA is the explicit boundary before `/evidence-records` reads or deep inspection; the source-gap lifecycle strip keeps mapped and unmapped rows separated and uses explicit loading/error/no-snapshot/empty copy without implying health; the capsule, source-health labels, and source-gap peek must not expose local paths, tmux refs, Hermes payloads, raw metadata, raw degraded reasons, or unmapped runtime evidence as selected-agent facts
- the selected-agent Evidence Ledger starts with a compact Proof Compass/basis summary derived only from already loaded evidence records; it redacts local path-like evidence refs in the summary, preserves the detailed ledger behind explicit inspection, and does not add write/control-plane requests
- the selected-agent Replay Bundle starts with a compact Replay Proof Ladder derived from the existing accountability replay audit verdict; it shows replayable row counts, collector-only gaps, unsupported gaps, and anchor event counts without exposing raw evidence refs, local paths, or making collector-only gaps look clickable
- once overview, workflow, incident, or correlation data has loaded successfully, later refresh failures keep the last-good surface visible with an explicit degraded-refresh notice
