# Phase 1 Correlation Drill-down Plan

> Keep this milestone backend-first, read-only, and reversible. Reuse existing evidence surfaces before touching UI.

Updated: 2026-03-10T06:05:34+08:00
Goal: add one aggregated drill-down query per `correlation_id` so incident feed items can land on a single evidence/replay surface.

## Milestone scope
- add `GET /correlations/:correlation_id?limit=&window=`
- aggregate only from the existing append-only event log plus existing incident, interaction, and timeline read models
- keep the route strictly read-only
- do not add dependencies, new write paths, new persisted tables, or new event types

## Exact tasks
1. Freeze the contract in `specs/api-contract.md`, `specs/phase1-spec.md`, `README.md`, and `docs/plans/phase1-kickoff-plan.md`.
2. Add a failing smoke test for `GET /correlations/:correlation_id` before touching production code.
3. Extend `src/store/prototype-store.js` with one minimal aggregation method that:
   - reuses existing incident, interaction, and timeline read semantics
   - dedupes `participant_agent_ids`
   - dedupes `evidence_refs`
   - computes `first_ts`, `last_ts`, `incident_count`, `interaction_count`, and `event_count`
4. Expose the read-only route in `src/server.js` and return `404` when the `correlation_id` matches nothing.
5. Keep `limit` slice-only:
   - cap `incidents`, `interactions`, and `timeline`
   - leave aggregate counts bound to the full filtered correlation slice
6. Reuse existing `window` parsing:
   - `Nm|Nh` format
   - omit `window` to keep the full correlation history
7. Run `npm test`.

## Acceptance checks
- `GET /correlations/:correlation_id` returns one evidence-first object, not a new stored projection.
- `incidents` stay descending, `interactions` keep existing interaction ordering, and `timeline` stays ascending.
- `participant_agent_ids` and `evidence_refs` are deduped across the full filtered correlation slice.
- `404` is returned when the `correlation_id` matches no incidents, interactions, or events.
- existing `/incidents`, `/interactions`, and `/timeline` behavior stays backward compatible.
