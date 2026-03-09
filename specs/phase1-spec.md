# Repo-local Phase 1 Spec Mirror

Source of truth: `/Users/cwp/.hermes/teams/web3-company/controller/phase1-spec-package.md`
Last mirrored: 2026-03-10T04:22:21+08:00

This repository mirrors the controller-approved Phase 1 scope so implementation stays under `/Users/cwp/Projects/metaverse-office-web` instead of `~/.hermes/teams/...`.

## Frozen decisions
- Phase 1 is a real-event-driven 2D office observability console
- Primary user is the internal team lead
- No 3D, no fake animation, no token layer, no onchain requirement
- Event/state architecture comes before UI polish
- Polling first, SSE second, WebSocket later only if justified

## Minimum deliverables
- append-only event ingestion boundary
- queryable agent/event/timeline/alert/handoff/reboot views
- communication/interactions read models derived from canonical events
- evidence binding to files and tmux observations
- repo-local implementation plan and backend scaffold
- controller snapshot collector that can emit evidence-backed peer-watch alerts from collected heartbeats without inventing new event types
- collector-derived canonical activity events for observed state changes and newer workspace writes, with duplicate suppression across unchanged snapshots
- enriched agent detail and peer-watch evidence queries over the existing append-only read models

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
- `GET /agents/:id` exposes the current projection plus `latest_heartbeat`, `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_handoffs`, and `recent_reboots`
- the detail query stays evidence-first: it reuses append-only heartbeats/events instead of adding a write path
- `GET /peer-watch/alerts?status=open` returns only currently unresolved alerts; omit `status` to inspect historical alert events
