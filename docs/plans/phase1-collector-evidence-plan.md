# Phase 1 Collector / Evidence Adapter Plan

> For Hermes: keep implementation minimal, schema-first, reversible, and tied to the current append-only prototype. Do not start UI work.

**Goal:** Add a controller-driven snapshot collector that converts real workspace file activity and tmux pane observations into store-backed heartbeats/evidence metadata for the seven-actor office model.

**Architecture:** Keep the current Node built-in stack. Add a small collector module that inspects known workspace roots and tmux pane metadata, derives agent heartbeats from real observations, and appends them through the existing store/write boundary. Expose one lead-only endpoint to trigger a snapshot and one read endpoint to inspect the latest collector report.

**Tech Stack:** Plain Node.js built-ins, existing CommonJS modules, node:test.

---

### Task 1: Freeze collector contract
- Update `specs/api-contract.md`
- Document `POST /collectors/controller-snapshot` and `GET /collectors/controller-snapshot`
- State that only `team-lead` may trigger snapshots
- Document that collected data is evidence-backed from workspace files and tmux, not fabricated UI state

### Task 2: Add collector module
- Create `src/collectors/controller-snapshot.js`
- Inspect each canonical agent workspace
- Read `inbox.md`, `outbox.md`, `todo.md` mtimes when present
- Capture tmux pane metadata for matching session refs
- Derive a minimal heartbeat shape per agent with:
  - `current_state`
  - `active_task`
  - `last_meaningful_output_at`
  - `last_file_write_at`
  - `current_blocker`
  - `confidence_level`
  - `reboot_recommended`
- Return a structured report with evidence refs and supervision hints

### Task 3: Persist collector snapshots through the store
- Extend `src/store/prototype-store.js`
- Track the latest collector report in memory
- Append collected heartbeats via existing append-only storage
- Expose a read method for the latest collector report
- Keep event/heartbeat storage format backward compatible

### Task 4: Expose controller-snapshot endpoints
- Modify `src/server.js`
- Add `GET /collectors/controller-snapshot`
- Add `POST /collectors/controller-snapshot`
- Require `x-actor-id: team-lead` for POST
- Keep GET read-only and deterministic

### Task 5: Add tests
- Add collector tests with injected fake workspace/tmux observations
- Add server smoke coverage for snapshot trigger + latest report readback
- Keep tests hermetic; do not depend on live tmux or the real team workspace
- Run `npm test`

### Task 6: Update handoff docs
- Update `README.md`
- Update `docs/plans/phase1-kickoff-plan.md`
- Record that the next step after this milestone is richer supervision/event emission, not decorative UI
