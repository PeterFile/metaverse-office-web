# Current Direction: Live Evidence Spine

Updated: 2026-05-15T10:14:43+08:00

## Product vision

Metaverse Office Web is the operator world for a real Hermes-agent company. Its job is to make multi-agent work observable, replayable, and accountable: who is active, what they are doing, why an alert or degradation exists, and which session/task/file/tmux evidence proves the claim.

This project is not a flashy dashboard, not a manual task-dispatch UI, and not a Kanban control plane. Hermes/Kanban may remain upstream execution systems. This repo should consume their runtime facts as evidence unless a future spec explicitly adds control-plane semantics.

## Current implementation facts

- Backend runtime is plain Node.js built-ins in `src/server.js` / `src/index.js`.
- Current persistent store defaults to the local append-only JSONL prototype at `data/prototype-store.jsonl`, selected by `METAVERSE_OFFICE_STORE_FILE` when set.
- SQLite storage is explicit opt-in via `METAVERSE_OFFICE_STORE_BACKEND=sqlite` or `METAVERSE_OFFICE_SQLITE_STORE_FILE`; it uses the local `sqlite3` CLI, stores the same append-only `records` stream in append order, maintains derived `record_index` / `record_evidence_refs` lookup sidecars, and hard-fails if `sqlite3` is missing instead of falling back to JSONL.
- The store replays persisted records into memory and derives current agent projections, read models, incidents, interactions, memory artifacts, correlation drilldowns, timeline replay, accountability replay, evidence-record queries, and the latest collector snapshot.
- Collector snapshot reports are persisted as append-only `collector_snapshot` records; collector-derived source facts are also persisted as internal append-only `evidence_record` records before the snapshot record.
- `evidence_record` entries preserve source kind, evidence ref, evidence role, source health status, output-candidate classification, collector correlation, and degraded reasons for workspace roots, workspace files, mapped tmux panes, and unmapped tmux runtime evidence.
- `GET /evidence-records` is read-only evidence inspection over replayed internal evidence records; it filters exact `agent_id`, `source_kind`, `evidence_role`, `output_candidate`, `evidence_ref`, `source_status`, `collector_snapshot_id`, `correlation_id`, optional `newest_first=true`, and `limit`, and must not collect, read tmux/filesystems, append records, or expose control-plane actions.
- Event and heartbeat counts still come only from `event` and `heartbeat` records; inbound `inbox.md`, workspace-root presence, and unmapped tmux evidence remain non-output evidence and must not advance meaningful-output state.
- Controlled writes are limited to `POST /events`, `POST /heartbeats`, and `POST /collectors/controller-snapshot` with `x-actor-id` validation.
- The domain still uses the canonical seven-actor office model: `team-lead` plus `market-intel`, `product-pmf`, `tokenomics`, `protocol-engineering`, `app-engineering`, and `growth-revenue`.
- Collector snapshots expose source health for workspace roots, watched workspace files, expected tmux sessions, and injected Hermes profile/session runtime facts; missing/degraded sources are explicit evidence state, and inbound `inbox.md`/workspace-root/Hermes presence does not imply agent output.
- The frontend is React + TypeScript + Vite under `apps/web`, with PixiJS AI Town rendering, world projection, roster, category Hub, selected-agent drilldowns, supervision/evidence/replay/memory surfaces, collector source-health/evidence-coverage/source-gap surfacing, selected-agent evidence ledger helper models, and browser smoke coverage.
- The UI consumes read models. It must not infer productivity, liveness, severity, or provenance that is absent from the API.

## Next milestone

`Live Evidence Spine` is the next product milestone.

Goal: connect the current read models and AI Town UI to real Hermes team runtime facts, then persist those facts with stronger query, replay, and provenance guarantees.

Minimum target outcomes:

1. Ingest real Hermes runtime facts from profiles, sessions, tmux panes, workspace artifacts, and compatible Kanban/task event sources as evidence records.
2. Map live Hermes agents/profiles to the office actor model without fabricating activity when a source is missing or degraded.
3. Keep the product boundary observability-first: no task dispatch, claim/complete controls, profile routing, or worker orchestration in this repo unless this document and the API contract are updated first.
4. Upgrade the prototype JSONL event spine to a structured append-only store, likely SQLite first, with indexes for event id, agent id, correlation id, source kind, evidence ref, and time range.
5. Preserve replayability: service restart must rebuild the same projection from persisted events, and each visible incident or status claim must point back to concrete evidence.
6. Keep AI Town as the primary operator surface, with Hub/drilldown views used for evidence inspection rather than dumping every fact into a side panel.

## Documentation discipline

Every future PR that changes one of these areas must update docs in the same PR:

- API routes, response shapes, filters, or error semantics: update `specs/api-contract.md` and README API notes.
- Event schema, actor model, source kinds, severity semantics, or storage behavior: update this document plus the relevant spec/docs.
- Runtime ingestion from Hermes, tmux, sessions, Kanban, or workspaces: update this document with source ownership, provenance, and degradation behavior.
- Frontend operator workflow, Hub category semantics, world projection, evidence/replay affordances, or request surfaces: update README and the relevant ADR/plan docs.
- Milestone completion or product direction changes: update this document first, then any historical references that could mislead future agents.

Historical `phase1-*` documents remain useful implementation records. They are not the current roadmap. If a future agent uses a Phase 1 file as authority without checking `docs/current-direction.md`, that is a process bug.

## Current non-goals

- Do not import Hermes Kanban as a writable board inside this product.
- Do not add manual task assignment or command dispatch from the UI.
- Do not represent decorative animation as real work.
- Do not introduce token/onchain mechanics without a fresh direction/spec update.
- Do not replace evidence-backed read models with markdown status dumps.
