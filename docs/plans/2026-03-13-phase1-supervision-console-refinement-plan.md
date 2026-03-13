# Phase 1 Supervision Console Refinement Plan

> For Hermes: use subagent-driven-development or Codex to implement this plan task-by-task. Keep the slice evidence-first, supervision-first, and reversible.

**Goal:** Strengthen the React operator shell so a lead can see who needs attention, who supervises whom, and what evidence supports that state without opening raw transcripts.

**Architecture:** Stay inside the existing read-only Phase 1 contract. Reuse `GET /office/overview`, `GET /agents/:id/workflow`, `GET /incidents`, and `GET /correlations/:correlation_id` only. Add thin derived UI projections in the frontend; do not add backend writes, new routes, or fake liveness.

**Tech Stack:** React, TypeScript, Vite, Vitest, existing pnpm workspace.

---

### Task 1: Add supervision-focused derived UI helpers

**Objective:** Centralize ordering and display logic for attention queue and watch topology instead of burying it in JSX.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/types.ts` only if new frontend-only helper types are needed
- Test: `apps/web/src/App.test.tsx`

**Steps:**
1. Add pure helper logic that sorts agents into an operator attention queue with highest urgency first.
2. Prioritize by effective severity, then reboot recommendation, then blocked state, while keeping ordering deterministic.
3. Build a display map from `overview.watch_edges` plus `overview.agents` so the UI can render readable watcher -> target relationships.
4. Keep the logic frontend-only and derived from current API payloads.

### Task 2: Render supervision topology and attention queue surfaces

**Objective:** Make supervision visible directly on the shell instead of hiding it in raw payloads.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Steps:**
1. Add an “Attention queue” panel that lists the highest-priority agents with severity, state, task, and reboot recommendation.
2. Add a “Watch topology” / “Supervision edges” panel that lists each watch edge with readable labels and watch mode.
3. Keep empty states explicit when there are no watch edges or no attention-worthy agents.
4. Reuse the current overview payload only; do not infer synthetic peer-watch relationships.

### Task 3: Surface evidence metadata in workflow, incident, and correlation cards

**Objective:** Make the shell more evidence-first so an operator can triage without guessing.

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.tsx`

**Steps:**
1. Extend incident cards to show source kind, counterparties, and evidence refs.
2. Extend interaction cards to show participants, correlation id, severity (when present), and evidence refs.
3. Extend timeline cards to show source kind, location, counterparties, and evidence refs.
4. Keep rendering sober: plain lists/tokens, no animation, no decorative charts.

### Task 4: Verify degraded/empty states still behave correctly

**Objective:** Preserve current polling and last-good-data semantics while the new surfaces are added.

**Files:**
- Modify: `apps/web/src/App.test.tsx`

**Steps:**
1. Update render tests to assert the new panels appear from overview data.
2. Add expectations that workflow/correlation cards expose evidence refs and source metadata.
3. Keep existing refresh degradation behavior green.

### Task 5: Verify end-to-end frontend quality gate

**Objective:** Ensure the shell remains green after the refinement.

**Files:**
- No new files required

**Steps:**
1. Run `pnpm web:test`.
2. Run `pnpm web:typecheck`.
3. Run `pnpm web:build`.
4. Run `pnpm test:all` if frontend changes touch shared assumptions.
