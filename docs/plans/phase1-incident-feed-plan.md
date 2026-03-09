# Phase 1 Incident Feed Plan

> Keep this milestone backend-first, read-only, and reversible. Reuse the existing append-only evidence trail before any UI work.

Updated: 2026-03-10T05:20:12+08:00
Goal: add a team-lead incident feed query so operators can inspect peer-watch alerts, handoffs, and reboots without jumping across multiple endpoints.

## Milestone scope
- add `GET /incidents?kind=&agent_id=&severity=&status=&correlation_id=&limit=&window=`
- derive the feed from existing peer-watch alert, handoff, and reboot read models
- keep output normalized and descending by incident timestamp
- do not add a new write path, new persisted tables, or new event types

## Exact tasks
1. Freeze the contract in `specs/api-contract.md`, `specs/phase1-spec.md`, `README.md`, and `docs/plans/phase1-kickoff-plan.md`.
2. Add a failing smoke test for `GET /incidents` before touching production code.
3. Extend the derived handoff and reboot read shapes only where incident normalization needs existing fields such as `status`, `severity`, `source_kind`, and `counterparty_agent_ids`.
4. Implement `store.listIncidents()` by normalizing:
   - peer-watch alerts to kind `peer_watch_alert`
   - handoffs to kind `handoff`
   - reboots to kind `reboot`
5. Keep the normalized item shape minimal:
   - `incident_id`, `kind`, `ts`, `agent_id`, `actor_id`, `status`, `severity`, `summary`, `correlation_id`, `evidence_refs`, `counterparty_agent_ids`, `source_kind`
6. Expose the read-only route in `src/server.js` without adding any write-side behavior.
7. Run `npm test`, then commit the milestone with a clear message.

## Acceptance checks
- `GET /incidents` returns a descending incident feed over existing read models only.
- `status=open` for peer-watch incidents keeps the current unresolved-alert semantics.
- `window` filters incident timestamps relative to request time without mutating stored data.
- existing `/peer-watch/alerts`, `/handoffs`, and `/reboots` behavior stays backward compatible.
