# Phase 1 Snapshot-Driven Supervision Events Plan

> For Hermes: keep implementation minimal, schema-first, reversible, and backend-only. Do not start UI work.

**Goal:** Extend the existing controller snapshot collector so one snapshot can append evidence-backed supervision alerts into the existing append-only event log without inventing new event types.

**Architecture:** Reuse the current Node built-in stack, the append-only prototype store, and the canonical `peer_watch_alert_raised` / `peer_watch_alert_resolved` event types. Derive collector alerts from collected heartbeats, not from UI assumptions.

**Tech Stack:** Plain Node.js built-ins, existing CommonJS modules, node:test.

---

### Task 1: Freeze the milestone contract

**Objective:** Document exactly what snapshot-driven supervision events must do before expanding runtime behavior.

**Files:**
- Modify: `specs/api-contract.md`
- Modify: `README.md`
- Reference: `specs/phase1-spec.md`

**Steps:**
1. State that `POST /collectors/controller-snapshot` persists heartbeats and may append `peer_watch_alert_raised` / `peer_watch_alert_resolved`.
2. Document yellow/orange staleness thresholds from `last_meaningful_output_at`.
3. Document that blocked or reboot-recommended collector items emit peer-watch alerts with evidence refs and metadata.
4. Keep `red` event-driven only; never derive `red` from elapsed time alone.

### Task 2: Derive collector-backed supervision incidents in the store

**Objective:** Keep append-only write logic and duplicate suppression inside the existing persistence layer.

**Files:**
- Modify: `src/store/prototype-store.js`
- Modify: `src/domain/index.js`

**Steps:**
1. Detect the current collector-backed alert state per agent from the existing event log.
2. Derive at most one active collector alert per agent from the incoming snapshot:
   - blocked / reboot-recommended wins
   - otherwise yellow/orange staleness
3. Reuse canonical peer-watch event types only.
4. Resolve prior collector alerts when snapshot evidence clears them.
5. Suppress duplicate raises when the derived collector condition is unchanged.

### Task 3: Keep projections evidence-first

**Objective:** Make the existing query surfaces reflect snapshot-generated supervision events without fabricating agent progress.

**Files:**
- Modify: `src/store/prototype-store.js`

**Steps:**
1. Keep collector-derived alert severity visible in agent projections.
2. Do not let collector peer-watch events overwrite `last_meaningful_output_at` for the target agent.
3. Keep blocked agents at their state-derived location in projections; do not move them just because an alert event exists.

### Task 4: Add hermetic tests

**Objective:** Prove the new milestone works without touching the live Hermes workspace or tmux server.

**Files:**
- Modify: `tests/controller-snapshot.test.js`
- Modify: `tests/server.smoke.test.js`
- Modify: `tests/domain.test.js`

**Steps:**
1. Add store tests for collector-driven alert raise behavior.
2. Add store tests for alert resolution when a later snapshot clears conditions.
3. Add store tests for duplicate suppression across repeated unchanged snapshots.
4. Add HTTP coverage showing `/collectors/controller-snapshot` populates `/events`, `/peer-watch/alerts`, `/timeline`, and agent projections.

### Task 5: Verify and commit

**Objective:** Finish the milestone cleanly and leave a reproducible trail.

**Steps:**
1. Run `npm test`.
2. Check the worktree for unrelated changes before committing.
3. Commit with a clear message describing snapshot-driven supervision events.
