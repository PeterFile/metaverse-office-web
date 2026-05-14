# Phase 1 Agent Workflow Slice Plan

> Historical archive notice: this document records an already-completed Phase 1 slice. It is not the current roadmap. Current product direction lives in `docs/current-direction.md`; current API/read-model semantics live in `specs/api-contract.md`. Future product/API/storage/runtime/UI progress must update the current docs in the same PR.

> Keep this milestone backend-first, read-only, and reversible. Reuse existing agent detail / incident / interaction / timeline read models before any UI work.

Updated: 2026-03-10T09:20:14+08:00
Goal: add one agent-centric operator workflow query so a future operator drawer can load detail, incidents, interactions, and replay evidence in one request without introducing a write path, dependency, or persisted table.

## Milestone scope
- add `GET /agents/:id/workflow?limit=&window=`
- aggregate only from the existing append-only event log plus existing `getAgentDetail`, incident, interaction, and timeline read models
- keep the route strictly read-only
- default `window` to `60m`
- keep per-slice `limit` semantics aligned with current detail/query endpoints
- expose deduped `correlation_ids` and `counterparty_agent_ids` for quick operator pivots
- derive workflow `counterparty_agent_ids` from every returned top-level slice, with interactions contributing via `participant_agent_ids` while excluding the focal agent and `team-lead`
- do not add new write APIs, event types, storage, dependencies, or UI work

## Exact tasks
1. Freeze the contract in `README.md`, `specs/api-contract.md`, `specs/phase1-spec.md`, and `docs/plans/phase1-kickoff-plan.md`.
2. Add failing smoke coverage for `GET /agents/:id/workflow`, unknown-agent `404`, and `window` / `limit` semantics before touching production code.
3. Extend `src/store/prototype-store.js` with one minimal aggregation method that:
   - reuses `getAgentDetail(agentId, { limit, now })`
   - reuses `listIncidents({ agent_id, window, limit, now })`
   - reuses `listAgentInteractions(agentId, { window, limit, now })`
   - reuses `listTimeline({ agent_id, window, limit, now })`
   - dedupes `correlation_ids`
   - dedupes `counterparty_agent_ids` across all returned top-level slices
   - derives interaction counterparties from `participant_agent_ids`
   - excludes the focal agent id and `team-lead` from workflow `counterparty_agent_ids`
4. Expose the read-only route in `src/server.js` and return `404` when `:id` is unknown.
5. Keep ordering semantics unchanged:
   - `incidents` stay descending
   - `interactions` keep current interaction ordering
   - `timeline` stays chronological ascending
6. Run `npm test`.

## Acceptance checks
- `GET /agents/:id/workflow` returns one evidence-first object, not a new stored projection.
- `detail` stays backward-compatible with `GET /agents/:id` semantics.
- `incidents`, `interactions`, and `timeline` reuse the existing normalized item shapes.
- `window` defaults to `60m` and filters only the time-bounded slices.
- `limit` caps each returned slice without changing aggregate/projection semantics.
- `correlation_ids` are deduped across the returned workflow slice.
- `counterparty_agent_ids` are deduped across the returned workflow slice, including interaction participants, while excluding the focal agent and `team-lead`.
- unknown agent ids return `404`.
- existing `/agents/:id`, `/agents/:id/incidents`, `/agents/:id/interactions`, and `/timeline` behavior stays backward compatible.
