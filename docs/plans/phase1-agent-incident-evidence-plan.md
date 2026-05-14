# Phase 1 Agent Incident Evidence Plan

> Historical archive notice: this document records an already-completed Phase 1 slice. It is not the current roadmap. Current product direction lives in `docs/current-direction.md`; current API/read-model semantics live in `specs/api-contract.md`. Future product/API/storage/runtime/UI progress must update the current docs in the same PR.

> Keep this milestone backend-first, read-only, and reversible. Reuse the existing incident feed before any UI work.

Updated: 2026-03-10T07:50:50+08:00
Goal: add agent-centric incident evidence surfaces so operators can inspect one agent's incidents without introducing a write path, dependency, or persisted table.

## Milestone scope
- add `GET /agents/:id/incidents?kind=&severity=&status=&correlation_id=&limit=&window=`
- extend `GET /agents/:id` with `recent_incidents`
- reuse the existing normalized incident feed semantics and ordering
- do not add new write APIs, new event types, new storage, or UI work

## Exact tasks
1. Freeze the contract in `README.md`, `specs/api-contract.md`, and `specs/phase1-spec.md`.
2. Add failing smoke coverage for `GET /agents/:id/incidents`, unknown-agent `404`, and `recent_incidents` on `GET /agents/:id`.
3. Reuse the existing incident read model in `src/store/prototype-store.js` for `recent_incidents` instead of adding a parallel projection.
4. Expose the agent-scoped read-only route in `src/server.js` with the agent id applied as an implicit incident filter.
5. Keep limit semantics unchanged:
   - `GET /agents/:id` uses the existing per-slice `limit`
   - `GET /agents/:id/incidents` reuses incident feed `limit` and `window`
6. Run `node --test` before closing the milestone.

## Acceptance checks
- `GET /agents/:id/incidents` returns the same normalized incident item shape as `GET /incidents`.
- the route supports `kind`, `severity`, `status`, `correlation_id`, `window`, and `limit`.
- unknown agent ids return `404`.
- `recent_incidents` is bounded by the existing agent detail `limit` semantics.
- existing `/incidents` and `/agents/:id` behavior stays backward compatible apart from the additive read-only field and route.
