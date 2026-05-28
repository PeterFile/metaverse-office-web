# Current Direction: Live Evidence Spine

Updated: 2026-05-28T14:22:50+08:00

## Product vision

Metaverse Office Web is the operator world for a real Hermes-agent company. Its job is to make multi-agent work observable, replayable, and accountable: who is active, what they are doing, why an alert or degradation exists, and which session/task/file/tmux evidence proves the claim.

This project is not a flashy dashboard, not a manual task-dispatch UI, and not a Kanban control plane. Hermes/Kanban may remain upstream execution systems. This repo should consume their runtime facts as evidence unless a future spec explicitly adds control-plane semantics.

## Current implementation facts

- Backend runtime is plain Node.js built-ins in `src/server.js` / `src/index.js`.
- Current persistent store defaults to the local append-only JSONL prototype at `data/prototype-store.jsonl`, selected by `METAVERSE_OFFICE_STORE_FILE` when set.
- SQLite storage is explicit opt-in via `METAVERSE_OFFICE_STORE_BACKEND=sqlite` or `METAVERSE_OFFICE_SQLITE_STORE_FILE`; it uses the local `sqlite3` CLI, stores the same append-only `records` stream in append order, maintains idempotently backfilled derived `record_index` / `record_evidence_refs` lookup sidecars for evidence ids, refs, source kind, evidence role, source status, collector snapshot, output-candidate, and observed/collected time queries, and hard-fails if `sqlite3` is missing instead of falling back to JSONL.
- The store replays persisted records into memory and derives current agent projections, read models, incidents, interactions, memory artifacts, correlation drilldowns, timeline replay, accountability replay, evidence-record queries, and the latest collector snapshot.
- Collector snapshot reports are persisted as append-only `collector_snapshot` records; collector-derived source facts are also persisted as internal append-only `evidence_record` records before the snapshot record.
- `evidence_record` entries preserve source kind, evidence ref, evidence role, source health status, output-candidate classification, collector correlation, degraded reasons, and bounded abstract input proof for opt-in task/Hermes source files; they cover workspace roots, workspace files, mapped tmux panes, mapped Hermes profile/session presence, unmapped tmux/Hermes runtime evidence, and normalized task evidence fixture facts.
- Task evidence projection is a safe contract only: it accepts allowlisted fixture source kinds, rejects claim/complete/assign/dispatch/route/writeback/mutate control fields, emits `task://` evidence refs with `evidence_role: task_reference` and `output_candidate: false`, preserves only abstract JSON/JSONL input proof such as format/index/line/ordinal fields, and must not read live task systems, dispatch work, route profiles, mutate Kanban state, or expose raw payloads, local paths, or secrets. Unmapped task evidence may be summarized on collector source-health only as aggregate `source_kind`/`status`/count/latest-observed rows, filtered by the same exact `source_kind` and source-health `status` contract, without exposing task refs, evidence refs, payloads, or local provenance.
- Hermes profile/session runtime facts may be ingested from the opt-in local file named by `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE` or explicit files/directories named by `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS`; when both are set, `PATHS` takes precedence. The controller owns reading that evidence input during collection, persists only abstract input/file ordinal provenance instead of local paths, maps only safe single profile/session matches onto seeded agents, keeps duplicate/shared-ref unsafe or unknown facts under `runtime_source_evidence.unmapped_hermes_sources`, reports degraded source health for duplicate/shared-ref mapped sources, and treats every such fact as evidence only with no task dispatch, profile routing, worker orchestration, liveness/productivity, writable Kanban, or other control-plane semantics.
- `GET /evidence-records` is read-only evidence inspection over replayed internal evidence records; it filters exact `evidence_id`, `agent_id`, `source_kind`, `evidence_role`, `output_candidate`, `evidence_ref`, `source_status`, `collector_snapshot_id`, `correlation_id`, optional `mapped=true|false`, valid observed/collected time windows, optional `newest_first=true`, and `limit`, and must not collect, read tmux/filesystems, append records, or expose control-plane actions.
- `GET /agents/evidence-spine/summary` is a global compact read-only evidence-spine summary for the canonical seven-agent roster. It returns only counts, stable buckets, canonical agent ids, and latest safe timestamps; treats null and non-seeded agent evidence as unmapped; preserves shared `/evidence-records` mapped semantics; and must not expose raw ids/refs, collector/correlation ids, local paths, tmux/Hermes/session/profile refs, metadata, degraded reasons, payloads, liveness/productivity inference, writes, or control-plane actions.
- `GET /agents/:id/evidence-spine` is the per-agent compact aggregate over existing evidence records, runtime source gaps, and collector source-health projections. Its source-health rows expose safe `evidence_count`/status/time fields instead of evidence-ref field names or raw refs, and it must not collect, read tmux/filesystems, append records, or expose runtime payloads, local paths, tmux/Hermes/session/profile refs, metadata, degraded reasons, liveness/productivity inference, writes, or control-plane actions.
- `GET /evidence-records/:evidence_id/source-context` is a bounded read-only context bundle for one replayed evidence record. It joins the safe `source_summary`, bounded record fields, same-evidence source-gap context, and same mapped-agent/source/snapshot source-health context when available; unknown ids return `404` without echoing the requested id; unmapped runtime evidence stays unmapped; and it must not expose raw evidence refs, collector/correlation ids, local paths, tmux/Hermes/session/profile refs, metadata, degraded reasons, payloads, URLs, tokens, webhooks, runtime reads, liveness/productivity inference, or control-plane actions.
- Event and heartbeat counts still come only from `event` and `heartbeat` records; inbound `inbox.md`, workspace-root presence, Hermes runtime presence, and unmapped runtime evidence remain non-output evidence and must not advance meaningful-output state.
- Controlled writes are limited to `POST /events`, `POST /heartbeats`, and `POST /collectors/controller-snapshot` with `x-actor-id` validation.
- The domain still uses the canonical seven-actor office model: `team-lead` plus `market-intel`, `product-pmf`, `tokenomics`, `protocol-engineering`, `app-engineering`, and `growth-revenue`.
- Collector snapshots expose source health for workspace roots, watched workspace files, expected tmux sessions, and injected Hermes profile/session runtime facts; missing/degraded sources are explicit evidence state, and inbound `inbox.md`/workspace-root/Hermes presence does not imply agent output.
- The frontend is React + TypeScript + Vite under `apps/web`, with PixiJS AI Town rendering, world projection, roster, category Hub, selected-agent drilldowns, supervision/evidence/replay/memory surfaces, collector source-health/evidence-coverage surfacing, a bounded runtime source-gap HUD queue, selected-agent evidence ledger helper models, a compact evidence Proof Compass/basis summary, selected-agent proof glance from the global evidence-spine summary, selected-agent replay proof ladder, evidence-id scoped replay first-fold context with a safe Back to Evidence path, selected-agent evidence record detail inspection, explicit source-context disclosure from an inspected evidence record, and browser smoke coverage.
- The UI consumes read models. It must not infer productivity, liveness, severity, or provenance that is absent from the API.

## Next milestone

`Live Evidence Spine` is the next product milestone.

Goal: connect the current read models and AI Town UI to real Hermes team runtime facts, then persist those facts with stronger query, replay, and provenance guarantees.

Minimum target outcomes:

1. Ingest real Hermes runtime facts from profiles, sessions, opt-in runtime source files, tmux panes, workspace artifacts, and explicitly integrated task evidence sources as evidence records.
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

## Delivery gate

Every Live Evidence Spine delivery should be small enough to review and score against this 100-point gate:

- Product fit (20): preserves the evidence-first operator-world boundary and does not add dashboard, Kanban, or control-plane product semantics.
- Scope control (15): ships the smallest coherent slice, with no unrelated route, API, storage, UI, or roadmap churn.
- Contract integrity (20): keeps API/storage/event semantics explicit, backward-compatible, and documented in the same PR when they change.
- Tests and verification (20): includes focused automated coverage or a documented narrow verification path that proves the evidence claim.
- Documentation durability (15): updates persistent direction/spec/runbook docs when behavior changes, without creating temporary progress markdown.
- Delivery risk (10): keeps PR size, migration risk, rollout assumptions, and degraded-source behavior obvious to reviewers.

Hard-fail any delivery that adds control-plane/task dispatch semantics, leaks raw refs/paths/tokens, fabricates liveness or productivity, is oversized for review, or changes semantics without matching documentation.

Transient progress belongs in Slack, Linear, or the controller/runtime systems that own that state. Do not add new markdown files for progress logs, temporary roadmaps, or status dumps.

## Current non-goals

- Do not import Hermes Kanban as a writable board inside this product.
- Do not add manual task assignment or command dispatch from the UI.
- Do not represent decorative animation as real work.
- Do not introduce token/onchain mechanics without a fresh direction/spec update.
- Do not replace evidence-backed read models with markdown status dumps.
