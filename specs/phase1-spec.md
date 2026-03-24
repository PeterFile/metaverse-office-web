# Repo-local Phase 1 Spec Mirror

Source of truth: `/Users/cwp/.hermes/teams/web3-company/controller/phase1-spec-package.md`
Last mirrored: 2026-03-12T00:19:57+08:00

This repository mirrors the controller-approved Phase 1 scope so implementation stays under `/Users/cwp/Projects/metaverse-office-web` instead of `~/.hermes/teams/...`.

## Frozen decisions
- Phase 1 is a real-event-driven 2D office observability console
- Primary user is the internal team lead
- No 3D, no fake animation, no token layer, no onchain requirement
- Event/state architecture comes before UI polish
- Polling first, SSE second, WebSocket later only if justified
- Phase 1 UI shell may use React + TypeScript, but only against the existing read-only operator contract

## Minimum deliverables
- append-only event ingestion boundary
- queryable agent/event/timeline/alert/handoff/reboot views
- communication/interactions read models derived from canonical events
- evidence binding to files and tmux observations
- repo-local implementation plan and backend scaffold
- controller snapshot collector that can emit evidence-backed peer-watch alerts from collected heartbeats without inventing new event types
- collector-derived canonical activity events for observed state changes and newer workspace writes, with duplicate suppression across unchanged snapshots
- enriched agent detail and peer-watch evidence queries over the existing append-only read models
- operator incident feed query derived from existing alert/handoff/reboot read models
- correlation drill-down query that aggregates incident, interaction, and replay evidence by `correlation_id`
- agent-centric incident evidence surfaces derived from the same read-only incident feed semantics
- agent-centric workflow query that aggregates detail, incidents, interactions, and replay evidence in one read-only response
- office operations query that derives the first live-operations queue from the existing append-only events, heartbeats, and current agent projections
- pnpm workspace + React operator shell that renders the canonical office overview and agent workflow drawer without adding a write path

## Canonical state enum
- idle
- researching
- planning
- coding
- blocked
- reviewing
- sleeping
- rebooting

## Canonical event types
- agent_started
- agent_stopped
- agent_state_changed
- agent_received_task
- agent_opened_file
- agent_wrote_file
- agent_asked_question
- agent_replied
- meeting_started
- meeting_ended
- review_started
- review_completed
- peer_watch_alert_raised
- peer_watch_alert_resolved
- agent_handoff_started
- agent_handoff_completed
- agent_memory_warning
- agent_hallucination_suspected
- agent_context_degraded
- agent_reboot_requested
- agent_reboot_completed

## Collector supervision addendum
- snapshot-driven supervision reuses `peer_watch_alert_raised` and `peer_watch_alert_resolved`
- collector-derived activity reuses canonical `agent_state_changed` and `agent_wrote_file`
- state-change activity is appended only when collector evidence shows a different current state than the previously known projection
- file-write activity is appended only when collector evidence shows a newer `last_file_write_at` than the previously known projection
- yellow/orange staleness derives from `last_meaningful_output_at` only
- blocked or reboot-recommended collector items raise peer-watch alerts with evidence refs and metadata
- repeated unchanged snapshots suppress duplicate activity and alert events
- time alone must never fabricate `red`

## Interaction read-model addendum
- communication records are exposed as read-only derived interactions over canonical events
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired interaction records only form when type, `correlation_id`, and participant lineage clearly match
- unmatched events stay as single-event interaction records rather than inferred conversations

## Timeline replay addendum
- `GET /timeline` stays a read-only replay slice over append-only canonical events
- supported filters are `window`, `agent_id`, `event_type`, `severity`, `correlation_id`, and `limit`
- replay output stays chronological ascending for readability
- when `limit` is provided, select the most recent matching events first and return that slice ascending
- each timeline item exposes `event_id`, `ts`, `agent_id`, `actor_id`, `event_type`, `severity`, `current_state`, `location`, `summary`, `correlation_id`, `counterparty_agent_ids`, `evidence_refs`, and `source_kind`
- collector-derived activity and supervision events flow through the same timeline item shape without rewriting their evidence or source fields

## Agent detail and alert read-model addendum
- `GET /agents/:id` exposes the current projection plus `latest_heartbeat`, `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_incidents`, `recent_handoffs`, and `recent_reboots`
- the detail query stays evidence-first: it reuses append-only heartbeats/events instead of adding a write path
- `recent_incidents` is derived from the same normalized incident feed used elsewhere, scoped to the requested agent and bounded by the existing detail `limit` semantics
- `GET /peer-watch/alerts?status=open` returns only currently unresolved alerts; omit `status` to inspect historical alert events

## Incident feed addendum
- `GET /incidents` stays read-only and derives one descending operator feed from existing peer-watch alert, handoff, and reboot read models
- supported filters are `kind`, `agent_id`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- supported `kind` values are `peer_watch_alert`, `handoff`, and `reboot`
- normalized incident items expose `incident_id`, `kind`, `ts`, `agent_id`, `actor_id`, `status`, `severity`, `summary`, `correlation_id`, `evidence_refs`, `counterparty_agent_ids`, and `source_kind`
- peer-watch `status=open` keeps the unresolved-alert semantics from the existing alert read model
- handoff and reboot records extend their derived shapes minimally so incident normalization can reuse them instead of inventing a new storage layer
- `GET /agents/:id/incidents` reuses the same read-only incident feed semantics with `:id` as the implicit agent filter and returns `404` for unknown agent ids

## Correlation drill-down addendum
- `GET /correlations/:correlation_id` stays read-only and aggregates one evidence-first drill-down surface from existing incident, interaction, and timeline/event read models
- the route does not add a new write path, persisted table, or event type; it only reuses append-only events and existing derived reads
- the response exposes `correlation_id`, deduped `participant_agent_ids`, deduped `evidence_refs`, `first_ts`, `last_ts`, `incident_count`, `interaction_count`, `event_count`, `incidents`, `interactions`, and `timeline`
- `window` reuses the existing `Nm|Nh` filter format; when omitted the drill-down keeps the full correlation history
- `limit` caps each returned detail slice while leaving aggregate counts bound to the full filtered correlation match set
- the route returns `404` when no incidents, interactions, or events match the requested `correlation_id`

## Agent workflow addendum
- `GET /agents/:id/workflow` stays backend-only, read-only, schema-first, and reversible
- the route reuses `getAgentDetail`, agent-scoped incident reads, agent-scoped interaction reads, and agent-scoped timeline reads instead of adding a new stored projection
- `detail` stays backward-compatible with `GET /agents/:id`
- `window` defaults to `60m` and applies only to the top-level time-bounded slices: `incidents`, `interactions`, and `timeline`
- `limit` caps each returned slice independently using the existing detail/query semantics
- the response exposes deduped `correlation_ids` from all returned top-level slices
- the response exposes deduped `counterparty_agent_ids` from all returned top-level slices; interaction-derived counterparties come from `participant_agent_ids`, and the final workflow list excludes the focal agent plus `team-lead`

## Office operations addendum
- `GET /office/operations` stays backend-only, read-only, schema-first, and reversible
- the route reuses the current agent projection plus the existing overview severity/staleness derivation; no new persistence, projection table, or event type is introduced
- default output is the active queue only: agents whose `current_state` is neither `idle` nor `sleeping`
- optional `agent_id` narrows the queue to one agent before the existing `state` and `limit` filters, which keeps selected-agent refreshes read-only and bounded
- optional `state` filters by one canonical `current_state`; optional `limit` caps the returned queue slice
- queue items expose the current projection, the latest-event correlation surface, and the latest event summary/evidence when present
- queue summary exposes `item_count`, `blocked_count`, `reboot_recommended_count`, `state_buckets`, and `severity_buckets` for the returned slice
- queue ordering is operational, not decorative: higher effective severity first, then reboot recommendations, then blocked state, then newer activity


## React operator shell addendum
- the first operator shell lives under `apps/web` and uses React + TypeScript with pnpm workspace management
- the shell consumes the existing `GET /office/overview`, `GET /office/operations`, `GET /agents/:id/workflow`, `GET /incidents`, `GET /timeline`, `GET /collectors/controller-snapshot`, and `GET /correlations/:correlation_id` read models only
- same-origin reads are the default; the shell may optionally prefix them with `VITE_API_BASE_URL` when the backend explicitly allows that frontend origin via `CORS_ALLOWED_ORIGINS`, and local dev may still proxy `/office`, `/agents`, `/incidents`, `/timeline`, `/correlations`, and `/collectors` from Vite without changing backend semantics
- workflow and incident surfaces may open correlation drill-down by reusing the existing read-only routes; no new write path or contract is introduced
- shell refresh stays polling-based in Phase 1; no websocket or SSE requirement is introduced by this slice
- UI must render explicit loading, empty, and error states instead of fabricating motion, severity, or productivity
- once an overview, workflow, incident, or correlation slice has loaded successfully, later poll failures keep the last-good read surface visible; explicit fatal error states are reserved for initial loads that have no prior good data
