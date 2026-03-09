# Metaverse Office Web

Updated: 2026-03-10T01:43:51+08:00

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
- derived interaction read models now expose communication records without adding a new write path
- enriched agent detail and peer-watch alert queries now expose current evidence surfaces without adding new writes

## Key documents
- `specs/phase1-spec.md`
- `specs/api-contract.md`
- `docs/plans/phase1-kickoff-plan.md`
- `docs/plans/phase1-supervision-events-plan.md`
- `docs/adr/0001-phase1-stack.md`
- `notes/source-documents.md`

## Backend scaffold
- runtime: plain Node.js built-ins only
- storage: append-only local JSONL file at `data/prototype-store.jsonl`
- seed domain: 6 employee agents plus `team-lead`
- canonical employee ids:
  - `market-intel`
  - `product-pmf`
  - `tokenomics`
  - `protocol-engineering`
  - `app-engineering`
  - `growth-revenue`

### Run
```bash
npm test
npm start
```

Optional env:
- `PORT=3000`
- `METAVERSE_OFFICE_STORE_FILE=/absolute/path/prototype-store.jsonl`

### API
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events`
- `GET /agents/:id/interactions`
- `GET /events`
- `GET /interactions`
- `GET /collectors/controller-snapshot`
- `GET /office/overview`
- `GET /timeline`
- `GET /peer-watch/alerts?status=&target_agent_id=&agent_id=&watcher_agent_id=&observer_agent_id=&correlation_id=&severity=&limit=`
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
- optional `limit` caps `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_handoffs`, and `recent_reboots`
- `open_peer_watch_alerts` is derived from unresolved peer-watch evidence, not from raw historical `raised` events

### Interaction read-model notes
- `GET /interactions` and `GET /agents/:id/interactions` are read-only query surfaces derived from the existing append-only event log
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired start/completed events collapse into one interaction only when interaction type, `correlation_id`, and participant lineage all match
- when that lineage is ambiguous, the server returns single-event interaction records instead of guessing
- global interaction filters: `interaction_type`, `counterparty_agent_id`, `severity`, `correlation_id`, `limit`, `window`

### Peer-watch alert query notes
- `GET /peer-watch/alerts` stays read-only and derives its evidence view from canonical peer-watch events
- supported filters are `status`, `target_agent_id`, backward-compatible `agent_id`, `watcher_agent_id`, `observer_agent_id`, `correlation_id`, `severity`, and `limit`
- `status=open` returns only currently unresolved alerts; omit `status` to inspect the full alert event history

### Controlled write rule
Prototype writes require `x-actor-id: <agent_id>`.
This keeps employee writes self-scoped and reserves cross-agent supervision/handoff/reboot events for `team-lead`.

### Collector snapshot notes
- `POST /collectors/controller-snapshot` is lead-only and requires `x-actor-id: team-lead`
- `GET /collectors/controller-snapshot` is read-only and returns the latest in-memory collector report
- collector heartbeats are derived from real `inbox.md`, `outbox.md`, `todo.md` mtimes plus tmux pane metadata
- collector-derived supervision reuses canonical `peer_watch_alert_raised` / `peer_watch_alert_resolved`
- yellow/orange staleness comes from `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- blocked or reboot-recommended collector items append evidence-backed peer-watch alerts with collector metadata
- repeated unchanged snapshots do not append duplicate raised alerts; cleared conditions append resolved alerts
- collector-derived peer-watch events do not fabricate `red` from time alone
- tests stay hermetic by injecting filesystem/tmux observations instead of touching the live Hermes workspace
- existing `/events`, `/timeline`, `/peer-watch/alerts`, and agent projections now reflect collector-driven supervision events
