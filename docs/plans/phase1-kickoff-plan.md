# Phase 1 Kickoff Implementation Plan

> For Hermes: keep implementation minimal, schema-first, and reversible. UI must not outrun the event/state architecture.

Updated: 2026-03-10T06:05:34+08:00
Goal: land the first meaningful implementation milestone in `/Users/cwp/Projects/metaverse-office-web`.

## Task 1 — Freeze repo-local spec docs
- Create/update `specs/phase1-spec.md`
- Create/update `specs/api-contract.md`
- Create/update `docs/adr/0001-phase1-stack.md`
- Verify these mirror the controller spec

## Task 2 — Scaffold backend domain model
- Create `src/domain/` for canonical enums and validators
- Define agent status, event, heartbeat, alert, handoff, and reboot shapes
- Add seed data for 6 employees + lead

## Task 3 — Build minimal query API
- Create a minimal server with `GET /health`, `GET /agents`, `GET /events`, `GET /timeline`
- Keep storage adapter simple and local
- Return deterministic projection data; no fake randomness

## Task 4 — Add controlled write endpoints
- Implement `POST /events` and `POST /heartbeats`
- Enforce self-write vs controller-write boundary
- Refresh projections on write

## Task 5 — Add smoke tests and run them
- Validate enums and payload checks
- Validate core read endpoints
- Validate write-path rejection for invalid payloads

## Task 6 — Prepare next UI-facing handoff
- Document the API response shapes the future office UI should consume
- Explicitly note that UI work starts only after API + schema milestone is green
- `GET /office/overview` is now the stable query surface for layout, occupants, watch edges, and derived staleness
- Next step stays backend-first: collectors / evidence adapters first, or a thin UI shell only against the frozen contract

## Status after the next backend milestone
- `GET /collectors/controller-snapshot` and `POST /collectors/controller-snapshot` now exist
- controller snapshots are lead-triggered only and append evidence-backed heartbeats through the existing store boundary
- latest collector report is exposed as a read model without changing append-only event/heartbeat storage
- collector snapshots now append deduped canonical `agent_state_changed` and `agent_wrote_file` events when evidence advances, so `/events` and `/timeline` stay aligned with projection updates
- next step remains backend-first: richer operator queries over the append-only evidence trail, not decorative UI
- `GET /interactions` and `GET /agents/:id/interactions` now expose a communication read model derived from append-only events
- `GET /agents/:id` now exposes latest heartbeat plus recent event/interaction/handoff/reboot evidence slices
- `GET /peer-watch/alerts` now supports evidence filters, with `status=open` derived from currently unresolved alerts instead of raw historical raises
- `GET /timeline` now supports replay filters and recent-slice semantics while keeping final output chronological ascending
- `GET /incidents` now exposes a descending read-only operator feed over peer-watch alerts, handoffs, and reboots using the existing derived read models
- `GET /correlations/:correlation_id` now exposes one aggregated evidence/replay surface for incident drill-down without adding new storage
- next step remains backend-first: keep deepening incident/evidence/replay queries before any UI work
