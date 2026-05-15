# ADR 0002: React operator shell for the office surface

Date: 2026-03-11
Status: accepted

Current note: this ADR records the React/Vite frontend stack decision that remains active. It was accepted during Phase 1, but current product direction now lives in `docs/current-direction.md`.

## Context
The user explicitly approved React for the frontend while keeping the evidence-first rule intact: UI must not outrun the event/state/storage/query architecture. The backend exposes read-only office overview, operations, agent workflow, incident feed, timeline, collector, replay, memory, peer-watch, and correlation routes that power the operator shell without requiring UI-owned write paths.

## Decision
- use a pnpm workspace rooted in the existing repository
- add a React + TypeScript + Vite web app at `apps/web`
- keep the backend entrypoint and append-only read/write model unchanged
- drive the operator shell from the existing read-only routes: `GET /office/overview`, `GET /office/operations`, `GET /agents/:id/workflow`, `GET /incidents`, `GET /timeline`, `GET /collectors/controller-snapshot`, `GET /collectors/controller-snapshot/evidence-coverage`, `GET /collectors/controller-snapshot/source-health`, `GET /accountability/replay`, `GET /memory/artifacts`, `GET /peer-watch/alerts`, and `GET /correlations/:correlation_id`
- allow cross-origin GET requests from the React shell when configured, using the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated list of allowed origins) for the backend.
- keep polling as the current freshness mechanism unless `docs/current-direction.md` and `specs/api-contract.md` introduce a new transport contract
- keep local development same-origin by default, allow an optional `VITE_API_BASE_URL` prefix for the shell only when the backend explicitly allows that origin via `CORS_ALLOWED_ORIGINS`, and keep the Vite proxy for consumed read-route prefixes optional

## Consequences
- the project gains a real living office surface without inventing new product semantics
- TypeScript becomes the frontend implementation language while the backend can remain minimal until a later migration is justified
- pnpm becomes the package/workspace entrypoint for frontend work and multi-package growth
- the office shell stays reversible because it depends on stable read-only contracts rather than a new persistence layer
