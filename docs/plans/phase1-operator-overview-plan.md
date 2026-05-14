# Phase 1 Operator Overview API Plan

> Historical archive notice: this document records an already-completed Phase 1 slice. It is not the current roadmap. Current product direction lives in `docs/current-direction.md`; current API/read-model semantics live in `specs/api-contract.md`. Future product/API/storage/runtime/UI progress must update the current docs in the same PR.

> For Hermes: keep implementation minimal, schema-first, and reversible. Do not start UI work; land operator-facing query surfaces only.

**Goal:** Add a backend office-overview query that exposes layout, occupants, watch topology, and derived staleness signals for the future operator UI.

**Architecture:** Extend the existing domain/store/server prototype without changing the append-only write model. Derive office-overview data from current projections plus spec-defined watch topology and yellow/orange thresholds.

**Tech Stack:** Plain Node.js built-ins, existing CommonJS modules, node:test.

---

### Task 1: Freeze the operator-overview contract

**Objective:** Define the minimum response shape before touching runtime code.

**Files:**
- Modify: `specs/api-contract.md`
- Modify: `README.md`
- Reference: `specs/phase1-spec.md`

**Steps:**
1. Add `GET /office/overview` to the read API list.
2. Document response sections: `generated_at`, `summary`, `zones`, `watch_edges`, `agents`.
3. Document derived staleness semantics using Phase 1 thresholds: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`.
4. Keep red severity event-driven only; do not fabricate red from time alone.

### Task 2: Add domain constants for office layout and watch topology

**Objective:** Make the office overview query deterministic and UI-ready without hardcoding layout logic in the server.

**Files:**
- Modify: `src/domain/index.js`
- Test: `tests/domain.test.js`

**Steps:**
1. Add canonical zone metadata for the lead desk, six agent desks, meeting zone, review zone, rest zone, and reboot zone.
2. Add a helper to return watch edges from the existing watch-target / watched-by mapping.
3. Add helpers for derived staleness severity from timestamps.
4. Keep all logic pure and exportable for tests.

### Task 3: Build the office overview projection in the store

**Objective:** Expose one query that future UI work can consume directly.

**Files:**
- Modify: `src/store/prototype-store.js`

**Steps:**
1. Add a `getOfficeOverview({ now })` store method.
2. Reuse current projections from `listAgents()`.
3. Group occupants by zone and include empty zones.
4. Compute summary counts for agent count, blocked count, reboot recommended count, and severity buckets.
5. Include per-agent derived staleness metadata without mutating persisted records.

### Task 4: Expose `GET /office/overview`

**Objective:** Make the new projection available over HTTP.

**Files:**
- Modify: `src/server.js`

**Steps:**
1. Add a read-only `GET /office/overview` route.
2. Use the existing `now()` callback for deterministic tests.
3. Return only derived data from the store; do not read files or tmux directly in the server.

### Task 5: Add tests and verify green

**Objective:** Prove the new operator API is stable and spec-aligned.

**Files:**
- Modify: `tests/server.smoke.test.js`
- Modify: `tests/domain.test.js`

**Steps:**
1. Add a domain test for zone metadata / watch edges / derived staleness logic.
2. Add a smoke test for `GET /office/overview` on the seed scaffold.
3. Add a smoke test showing yellow/orange staleness escalation from timestamps while explicit reboot or alert severity still flows through.
4. Run `npm test`.

### Task 6: Update the implementation handoff docs

**Objective:** Record the new milestone so the next implementation step can focus on collectors or UI against a stable contract.

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/phase1-kickoff-plan.md`

**Steps:**
1. Note that office-overview query data now exists for future UI work.
2. Keep the next step backend-oriented: collectors / evidence adapters or a thin UI shell only after this contract is green.
