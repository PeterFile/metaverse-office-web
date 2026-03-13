# ADR 0002: React operator shell for Phase 1 office surface

Date: 2026-03-11
Status: accepted

## Context
The user explicitly approved React for the frontend while keeping the existing Phase 1 rule intact: UI must not outrun the event/state architecture. The backend already exposes read-only office overview, agent workflow, incident feed, and correlation drill-down routes that can power a first operator shell without new event types or write paths.

## Decision
- use a pnpm workspace rooted in the existing repository
- add a React + TypeScript + Vite web app at `apps/web`
- keep the backend entrypoint and append-only read/write model unchanged
- drive the first UI shell from the existing read-only operator routes: `GET /office/overview`, `GET /agents/:id/workflow`, `GET /incidents`, and `GET /correlations/:correlation_id`
- allow cross-origin GET requests from the React shell when configured, using the `CORS_ALLOWED_ORIGINS` environment variable (comma-separated list of allowed origins) for the backend.
- use polling for freshness in Phase 1; do not add websocket or SSE requirements in this slice
- keep local development same-origin by default, allow an optional `VITE_API_BASE_URL` prefix for the shell only when the backend explicitly allows that origin via `CORS_ALLOWED_ORIGINS`, and keep the Vite proxy for `/office`, `/agents`, `/incidents`, and `/correlations` optional

## Consequences
- the project gains a real living office surface without inventing new product semantics
- TypeScript becomes the frontend implementation language while the backend can remain minimal until a later migration is justified
- pnpm becomes the package/workspace entrypoint for frontend work and multi-package growth
- the office shell stays reversible because it depends on stable read-only contracts rather than a new persistence layer
