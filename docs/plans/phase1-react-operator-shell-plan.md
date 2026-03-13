# Phase 1 React Operator Shell Plan

> For Hermes: keep this slice thin, evidence-first, and reversible. React is allowed, but UI must consume the existing read-only contract instead of inventing new product semantics.

Updated: 2026-03-11T00:08:00+08:00
Goal: bootstrap the first React + TypeScript + pnpm operator shell so the metaverse office gains a real living surface without outrunning the backend event/state architecture.

## Milestone scope
- switch repo workflow to pnpm while keeping the current backend runnable
- add a React + TypeScript frontend app under `apps/web`
- consume existing `GET /office/overview`, `GET /agents/:id/workflow`, `GET /incidents`, and `GET /correlations/:correlation_id` read models only
- render the canonical office grid, severity-aware agent cards, and a selected-agent workflow drawer
- poll read-only endpoints for freshness; do not add WebSocket/SSE/write paths in this slice
- preserve existing backend behavior and tests
- add frontend tests for the new shell

## Non-goals
- no 3D world, canvas engine, decorative animation, or fake occupancy motion
- no new backend write API, projection table, or event type
- no transcript-first UI
- no token/points/gameplay mechanics
- no dependency on live Hermes workspaces in frontend tests

## Exact tasks
1. Freeze the slice in docs:
   - update `README.md`
   - update `specs/phase1-spec.md`
   - update `specs/api-contract.md`
   - add `docs/adr/0002-react-operator-shell.md`
2. Convert the repo to pnpm-first without breaking the current Node backend:
   - update root `package.json` with `packageManager`, pnpm scripts, and web-facing commands
   - add `pnpm-workspace.yaml`
   - keep backend entrypoint and `node --test` flow intact through pnpm scripts
3. Bootstrap `apps/web` with React + TypeScript + Vite:
   - `apps/web/package.json`
   - `apps/web/tsconfig.json`
   - `apps/web/vite.config.ts`
   - `apps/web/index.html`
   - `apps/web/src/main.tsx`
4. Add a typed frontend query layer that only calls:
   - `GET /office/overview`
   - `GET /agents/:id/workflow?limit=&window=`
   - `GET /incidents?limit=&window=`
   - `GET /correlations/:correlation_id?limit=&window=`
   - backend query semantics stay unchanged; only deployment/runtime support such as read-only CORS may be added if needed for separately hosted shell access
5. Implement the first operator shell:
   - summary header from office overview counts
   - deterministic office grid from canonical zone metadata
   - agent cards showing state, task, and severity
   - selected-agent workflow drawer/panel with incidents, interactions, timeline, correlation ids, and counterparties
   - global incident feed and correlation drill-down surfaces for cross-agent triage
   - loading / empty / error states that are explicit rather than theatrical
   - degraded refresh notices that preserve the last-good read surface after polling failures
6. Add frontend tests and verification:
   - render test for overview summary / grid
   - interaction test for selecting an agent and loading workflow data
   - run backend tests plus frontend tests

## Acceptance checks
- the repo is pnpm-first and the frontend code is TypeScript
- the backend remains read-only for UI queries and passes its existing tests unchanged
- the office shell is driven by the existing API contract, not mock-only product semantics
- selecting an agent reveals evidence-first workflow data from the existing workflow route
- UI states stay sober and operational: no fake motion, no fabricated red severity, no fake liveness
- React shell can be run independently against the local backend with a configurable API base URL
