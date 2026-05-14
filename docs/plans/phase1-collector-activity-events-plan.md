# Phase 1 Collector Activity Events Plan

> Historical archive notice: this document records an already-completed Phase 1 slice. It is not the current roadmap. Current product direction lives in `docs/current-direction.md`; current API/read-model semantics live in `specs/api-contract.md`. Future product/API/storage/runtime/UI progress must update the current docs in the same PR.

Updated: 2026-03-10T03:07:27+08:00
Goal: keep `/events` and `/timeline` aligned with collector-driven projection changes without adding a new write path.

## Scope
- append collector-derived `agent_state_changed` when snapshot evidence shows a new current state versus the previous projection
- append collector-derived `agent_wrote_file` when snapshot evidence shows a newer `last_file_write_at`
- suppress duplicates across unchanged snapshots
- keep evidence binding explicit and canonical

## Files
- `src/store/prototype-store.js`
- `src/domain/index.js`
- `tests/controller-snapshot.test.js`
- `tests/server.smoke.test.js`
- `README.md`
- `specs/api-contract.md`
- `specs/phase1-spec.md`
- `docs/plans/phase1-kickoff-plan.md`

## Verification
- `npm test`
- confirm `POST /collectors/controller-snapshot` can surface the new activity events through `/events` and `/timeline`
- confirm repeated unchanged snapshots do not append duplicate activity events
