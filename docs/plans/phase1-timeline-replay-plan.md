# Phase 1 Timeline Replay Plan

> For Hermes: keep implementation minimal, schema-first, reversible, and read-only. No new write path.

**Goal:** Extend `GET /timeline` into a replay slice query over append-only canonical events so the operator surface can filter recent activity without inventing new storage or new event types.

**Architecture:** Reuse the existing server route and append-only event store. Apply filters at query time, keep replay output chronological ascending, and when `limit` is present select the newest matching events before returning that slice ascending.

**Tech Stack:** Plain Node.js built-ins, existing CommonJS modules, node:test.

---

### Task 1: Freeze the replay contract
- Update `specs/phase1-spec.md`
- Update `specs/api-contract.md`
- Document `window`, `agent_id`, `event_type`, `severity`, `correlation_id`, and `limit`
- Document the required timeline item fields and ascending replay semantics

### Task 2: Thread replay filters through the read API
- Modify `src/server.js`
- Pass the new timeline query params into the store
- Keep the route read-only and backward compatible

### Task 3: Extend the timeline store query
- Modify `src/store/prototype-store.js`
- Reuse canonical event filters instead of adding a new query shape
- Return evidence-first timeline items with `counterparty_agent_ids`, `evidence_refs`, and `source_kind`
- Apply `limit` as "most recent matching events, final output ascending"

### Task 4: Add smoke coverage
- Update `tests/server.smoke.test.js`
- Cover replay filters on `agent_id`, `event_type`, `severity`, and `correlation_id`
- Cover evidence/source fields on timeline items
- Cover ascending replay order after `limit`
- Cover collector-derived activity and supervision passthrough
- Run `npm test`

### Task 5: Update handoff docs
- Update `README.md`
- Update `docs/plans/phase1-kickoff-plan.md`
- Keep the next step backend-first: query/evidence work ahead of UI
