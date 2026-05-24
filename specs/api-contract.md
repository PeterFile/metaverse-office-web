# Current API Contract

Updated: 2026-05-22T02:15:14+08:00

This is the current API/read-model contract for Metaverse Office Web. It grew out of the Phase 1 contract, but it is no longer a Phase 1 draft. Update this file in the same PR as any route, response shape, filter, event schema, source-kind, storage, or request-surface change. Current product direction lives in `docs/current-direction.md`.

## Read APIs
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events?limit=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=`
- `GET /agents/:id/incidents?kind=&severity=&status=&correlation_id=&limit=&window=`
- `GET /agents/:id/interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /agents/:id/workflow?limit=&window=`
- `GET /collectors/controller-snapshot`
- `GET /collectors/controller-snapshot/evidence-coverage?agent_id=&source_kind=&confidence_level=&limit=`
- `GET /collectors/controller-snapshot/source-health?collector_snapshot_id=&agent_id=&source_kind=&status=&limit=`
- `GET /collectors/controller-snapshot/history?collector_snapshot_id=&agent_id=&source_kind=&status=&collected_since=&collected_until=&limit=`
- `GET /collectors/controller-snapshot/diff?from_collector_snapshot_id=&to_collector_snapshot_id=&from=&to=&limit=`
- `GET /evidence-records?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/facets?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/ref-rollup?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&evidence_ref=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /evidence-records/:evidence_id`
- `GET /evidence-records/:evidence_id/provenance-bundle`
- `GET /runtime/source-gaps?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/agent-summary?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/lifecycle?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&limit=`
- `GET /runtime/source-gaps/trend?evidence_id=&agent_id=&source_kind=&evidence_role=&output_candidate=&source_status=&collector_snapshot_id=&correlation_id=&mapped=&observed_since=&observed_until=&collected_since=&collected_until=&newest_first=&bucket=&limit=`
- `GET /events?event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /interactions?event_id=&evidence_ref=&interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /office/overview`
- `GET /office/operations?limit=&state=&agent_id=&severity=`
- `GET /timeline?window=&event_id=&agent_id=&event_type=&severity=&source_kind=&evidence_ref=&correlation_id=&limit=`
- `GET /accountability/replay?event_id=&evidence_id=&evidence_ref=&correlation_id=&agent_id=&source_kind=&artifact_kind=&limit=&window=`
- `GET /accountability/replay/checkpoint-summary`
- `GET /accountability/replay/checkpoint-log?limit=&record_kind=&evidence_id=&collector_snapshot_id=&correlation_id=&source_kind=`
- `GET /peer-watch/alerts?status=&target_agent_id=&agent_id=&watcher_agent_id=&observer_agent_id=&correlation_id=&severity=&limit=`
- `GET /incidents?kind=&agent_id=&severity=&status=&correlation_id=&limit=&window=`
- `GET /correlations/:correlation_id?limit=&window=`
- `GET /memory/artifacts?limit=&window=&agent_id=&correlation_id=&artifact_ref=&event_type=&severity=&source_kind=&artifact_kind=`
- `GET /handoffs`
- `GET /reboots`

## Write APIs
- `POST /events`
- `POST /heartbeats`
- `POST /collectors/controller-snapshot`

## Prototype write control
- all write requests must send `x-actor-id: <agent_id>`
- employee agents may emit only self-scoped events and heartbeats for their own `agent_id`
- the team lead/controller may emit cross-agent `agent_received_task` dispatch plus supervision, handoff, reboot, review, and meeting events
- `POST /collectors/controller-snapshot` is controller-only and must send `x-actor-id: team-lead`
- event location is system-derived from event/state mapping; callers must not control office placement
- `agent_received_task` remains queryable through the existing read models but does not advance `last_meaningful_output_at`; staleness still derives from real agent output/heartbeat evidence
- `POST /events` validates source provenance at the write boundary: `controller_event` requires the team lead actor, `workspace_file` requires non-empty non-`tmux://` `evidence_ref` values and rejects `tmux://` refs, `tmux_observation` requires canonical `tmux://` `evidence_ref` values without boundary whitespace and rejects non-tmux refs, and `raw_transcript` requires a non-empty `evidence_ref`; refs are never inferred from metadata

## Storage contract
- The default append-only store remains JSONL at `data/prototype-store.jsonl`, or `METAVERSE_OFFICE_STORE_FILE` when set.
- SQLite storage is opt-in only: `METAVERSE_OFFICE_STORE_BACKEND=sqlite` or `METAVERSE_OFFICE_SQLITE_STORE_FILE=/absolute/path/prototype-store.sqlite`.
- `METAVERSE_OFFICE_SQLITE_BIN` may point at a non-default `sqlite3` CLI. Missing `sqlite3` or unknown `METAVERSE_OFFICE_STORE_BACKEND` values fail startup; there is no silent fallback to JSONL.
- JSONL and SQLite store the same append-only record stream and replay through the same in-memory read-model code. SQLite stores canonical records in `records(seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload_json TEXT NOT NULL, appended_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`, replays with `ORDER BY seq`, blocks `UPDATE`/`DELETE` with append-only triggers, and may maintain derived lookup sidecars such as `record_index` and `record_evidence_refs`. Sidecars are rebuilt/idempotently backfilled from canonical `records`; they are not a write API or source of truth. `record_index` may carry evidence lookup fields including `evidence_role`, `source_status`, `collector_snapshot_id`, `source_kind`, `output_candidate`, `observed_at`, and `collected_at` so query/index evolution does not change canonical payload semantics.
- `GET /accountability/replay/checkpoint-summary` is a sanitized read-only checkpoint over the replayed append-only record stream; it returns `{ "item": { "record_count": number, "record_kind_buckets": object, "agent_count": number, "event_count": number, "heartbeat_count": number, "evidence_record_count": number, "collector_snapshot_count": number, "latest_event": object|null, "latest_heartbeat": object|null, "latest_evidence_record": object|null, "latest_collector_snapshot": object|null } }`, uses append order for latest anchors, exposes only bounded ids, timestamps, source kinds, status/role fields, counts, and booleans, and never returns evidence record ids derived from raw refs, raw evidence refs, local paths, summaries, metadata, degraded reason arrays, payloads, secrets, tmux/filesystem reads, append-only writes, or control-plane actions.
- `GET /accountability/replay/checkpoint-log?limit=&record_kind=&evidence_id=&collector_snapshot_id=&correlation_id=&source_kind=` is a sanitized read-only checkpoint log over the replayed append-only record stream; it returns `{ "items": [{ "append_index": number, "record_kind": string, "checkpoint": object|null }] }`, defaults and bounds `limit` like other read routes, optional non-blank `record_kind`, `evidence_id`, `collector_snapshot_id`, `correlation_id`, and `source_kind` exact-match replayed records before limit, unknown exact values return an empty `items` array, keeps newest selected rows in append order, uses the same bounded checkpoint objects as `checkpoint-summary`, and never returns raw evidence ids, raw evidence refs, local paths, summaries, metadata, degraded reason arrays, payloads, secrets, tmux/filesystem reads, append-only writes, or control-plane actions.

## Collector snapshot semantics
- `GET /collectors/controller-snapshot` is read-only and returns `{ "item": null }` until a snapshot has been collected
- `POST /collectors/controller-snapshot` triggers one controller snapshot, persists only evidence-backed output heartbeats, may append collector-derived canonical activity and peer-watch events, appends internal `evidence_record` records for collector-observed source facts and missing/error expected workspace files, and stores the resulting report as an append-only `collector_snapshot` record
- collected heartbeat coverage is derived from real workspace metadata (`inbox.md`, `outbox.md`, `todo.md`) and tmux pane metadata for the canonical seven-actor roster; `inbox.md` and `workspace_root` are inbound/presence evidence and must not advance meaningful-output or file-write freshness
- the collector must not fabricate random activity, random severity, or random timestamps
- the latest collector report is a replayed read model backed by append-only `collector_snapshot` records; collector-observed source facts are replayed from internal append-only `evidence_record` records; heartbeat storage stays backward compatible as append-only `heartbeat` records
- each `evidence_record` stores `evidence_id`, `observed_at`, `collected_at`, `agent_id`, `source_kind`, `evidence_ref`, `evidence_role`, `source_status`, `output_candidate`, collector correlation fields, degraded reasons, and metadata; current collector source kinds are `workspace_root`, `workspace_file`, `tmux_observation`, `hermes_profile`, `hermes_session`, and opt-in fixture task evidence source kinds `kanban_fixture`, `linear_fixture`, `slack_fixture`, `task_fixture`; expected `workspace_file` facts with `source_status: missing|error` are persisted with `output_candidate: false` even when their role is `agent_output` or `agent_plan`
- task evidence projection is a local normalization and opt-in file ingestion contract: allowlisted fixture facts with `source_kind` `kanban_fixture`, `linear_fixture`, `slack_fixture`, or `task_fixture` may be projected to canonical `evidence_record` payloads with `evidence_ref: task://<source_kind>/<task_ref>`, `evidence_role: task_reference`, `output_candidate: false`, safe `task_ref`/optional `fact_id` metadata, and no raw title/comment/body/description/path/secret/payload fields; invalid, unsupported, or secret-shaped identifiers are rejected or degraded without leaking raw values
- opt-in Hermes runtime source ingestion is enabled by `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS` or legacy `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE`; unset preserves empty Hermes runtime input, `PATHS` takes precedence over `FILE`, `PATHS` is `path.delimiter`-separated and may name files or directories, directories expand only local `.json`/`.jsonl` files in stable lexical order, inputs read JSON arrays or JSONL facts owned by the deployment/controller environment, accepts only `hermes_profile` and `hermes_session` evidence facts, and missing/unreadable input, invalid file content, invalid facts, unsafe runtime strings, or generic URI schemes (`http://`, `https://`, `file://`) fail the collection request before any event, heartbeat, evidence-record, or collector-snapshot append; runtime metadata is reduced to bounded allowlisted primitives and other metadata keys are dropped
- opt-in local task evidence ingestion is enabled only by `METAVERSE_OFFICE_TASK_EVIDENCE_FILE`; unset preserves empty task evidence input, the file must contain a JSON array or JSONL facts owned by the deployment/controller environment with safe `task_ref`, supported fixture `source_kind`, valid `observed_at`, and safe `correlation_id`, optional safe `agent_id` maps only to seeded agents, and missing/unreadable input, invalid file content, unsupported source kinds, invalid facts, local paths, secret-shaped identifiers, or raw payload-only facts fail closed before any collector-snapshot append
- `GET /evidence-records` is a small read-only query surface over replayed `evidence_record` facts; it returns `{ "items": [...] }`, delegates to `store.listEvidenceRecords`, and never triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /evidence-records/facets` is a small read-only facet surface over replayed `evidence_record` facts; it accepts the same filters as `GET /evidence-records`, returns `{ "item": { "total_count": number, "returned_limit": number, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "output_candidate_buckets": { "true": number, "false": number }, "mapped_buckets": { "mapped": number, "unmapped": number }, "agent_id_buckets": object } }`, computes buckets before `limit`, keeps stable zero-valued bucket keys for current source kinds, evidence roles, source statuses, seeded agent ids, and `unmapped`, ignores unknown or unsafe historical bucket values instead of echoing them as response keys, and never returns raw evidence rows, ids, refs, metadata, degraded arrays, paths, tmux refs, payloads, or triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /evidence-records/:evidence_id` is a read-only detail deep-link over replayed `evidence_record` facts; it returns `{ "item": evidence_record }` with the same item shape as `GET /evidence-records`, exact-matches the path `evidence_id`, returns `404` with `error: "not_found"` when missing, and must not shadow `GET /evidence-records/summary`
- `GET /evidence-records/:evidence_id/provenance-bundle` is a read-only provenance bundle for one replayed `evidence_record`; it returns `404` with `error: "not_found"` when missing, returns bounded record fields plus `source_summary` and nullable `snapshot`, `source`, and `replay` anchors when their stored source fields exist, and never exposes raw local paths, raw evidence refs, raw payloads, metadata, degraded reason arrays, secrets, tmux/filesystem reads, append-only writes, or control-plane actions. `source_summary` is a bounded summary object `{ "kind": string|null, "status": string|null, "role": string|null, "output_candidate": boolean, "mapped": boolean, "time": { "observed_at": string|null, "collected_at": string|null } }`; unknown or unsafe source enum values are projected to `null` in `source_summary` and bounded record/source-anchor fields rather than echoed; invalid or unsafe timestamps are projected to `null` in `source_summary.time` and bounded record time fields rather than echoed; `source_summary` must not include snapshot ids, correlation ids, evidence refs, raw metadata, degraded reasons, local paths, tmux/Hermes/session/profile refs, tokens, webhooks, or payload-derived text.
- `GET /evidence-records/summary` is the only evidence-record summary route; it is read-only over replayed `evidence_record` facts, accepts the same filters as `GET /evidence-records`, returns `{ "item": { "total_count": number, "returned_limit": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": { "true": number, "false": number }, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "collector_snapshot_id_buckets": object, "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null } }`, computes counts, buckets, and extrema before `limit`, exposes the parsed `returned_limit`, returns zero counts and null extrema for empty matches, keeps stable zero-valued bucket keys for current source kinds, evidence roles, and source statuses, and never returns raw evidence payloads, evidence ids, refs, metadata, degraded arrays, or triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /evidence-records/ref-rollup` is the grouped evidence-ref rollup route; it is read-only over replayed `evidence_record` facts, accepts the same filters as `GET /evidence-records`, returns `{ "item": { "total_count": number, "total_groups": number, "returned_limit": number, "groups": [{ "evidence_ref": string, "record_count": number, "mapped_count": number, "unmapped_count": number, "agent_id_buckets": object, "source_kind_buckets": object, "source_status_buckets": object }] } }`, computes groups before `limit`, sorts groups by `record_count` descending then `evidence_ref` ascending, limits returned groups only, and never returns raw evidence payloads, metadata, degraded reason arrays, or triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /runtime/source-gaps` is a compact read-only feed over replayed `evidence_record` facts; it returns `{ "items": [...] }`, accepts the listed evidence-record filters except raw `evidence_ref`, returns only non-task source facts with `source_status` values `missing`, `degraded`, or `error` plus observed unmapped runtime evidence (`agent_id: null`, `evidence_role: runtime_unmapped`, `source_status: observed`), excludes normal observed mapped evidence and all fixture `task_reference` rows by default, omits evidence ids, raw evidence refs, metadata, and degraded reason arrays, and never triggers collection, tmux/filesystem reads, append-only writes, incident/severity/liveness escalation, or control-plane actions
- `GET /runtime/source-gaps/summary` is the only runtime source-gap summary route; it is read-only over the same filtered source-gap set as `GET /runtime/source-gaps`, accepts the same filters except raw `evidence_ref`, returns `{ "item": { "total_count": number, "returned_limit": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": { "true": number, "false": number }, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "collector_snapshot_id_buckets": object, "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null } }`, computes counts and lifecycle extrema before `limit`, returns zero counts and null extrema for empty matches, and never returns evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, or triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- `GET /runtime/source-gaps/agent-summary` is a compact read-only grouping surface over the same filtered source-gap set as `GET /runtime/source-gaps`; it accepts the same filters except raw `evidence_ref`, returns `{ "item": { "total_count": number, "total_groups": number, "returned_limit": number, "groups": [{ "agent_id": string|null, "source_kind": string|null, "record_count": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object, "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null }] } }`, groups by exact `agent_id` and `source_kind`, keeps literal stored agent ids such as `unmapped` distinct from `agent_id: null` unmapped runtime groups, computes groups before `limit`, returns zero counts and empty groups for empty matches, and never returns evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, or triggers collection, tmux/filesystem reads, append-only writes, incident/severity/liveness escalation, or control-plane actions
- `GET /runtime/source-gaps/lifecycle` is a compact read-only lifecycle grouping surface over filtered evidence records; it accepts the same filters except raw `evidence_ref`, returns `{ "item": { "total_count": number, "total_groups": number, "returned_limit": number, "groups": [{ "agent_id": string|null, "source_kind": string|null, "evidence_role": string|null, "current_status": string|null, "lifecycle_state": "opened"|"continuing"|"resolved"|"observed_unmapped", "first_observed_at": string|null, "last_observed_at": string|null, "first_collected_at": string|null, "last_collected_at": string|null, "snapshot_count": number, "source_status_buckets": object }] } }`, groups by exact `agent_id`, `source_kind`, and `evidence_role`, returns only groups that have a source-gap signal, computes groups before `limit`, returns zero counts and empty groups for empty matches, and never returns collector snapshot ids, evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, incident/severity/liveness/productivity inference, or control-plane actions
- `GET /runtime/source-gaps/trend` is a compact read-only trend over the same filtered source-gap set as `GET /runtime/source-gaps`; it accepts the same filters except raw `evidence_ref`, plus `bucket=hour|day` (`hour` default), returns `{ "item": { "bucket": "hour"|"day", "total_count": number, "total_buckets": number, "returned_limit": number, "buckets": [{ "bucket_start": string, "total_count": number, "mapped_count": number, "unmapped_count": number, "output_candidate_buckets": object, "source_kind_buckets": object, "evidence_role_buckets": object, "source_status_buckets": object }] } }`, computes time buckets from observed time with collected time as fallback, applies `limit` only to returned buckets, and never returns agent ids, collector snapshot ids, evidence ids, refs, metadata, degraded reason arrays, paths, tmux refs, Hermes payloads, liveness/productivity/severity inference, or control-plane actions
- evidence-record filters are exact and additive: `evidence_id`, `agent_id`, `source_kind`, `evidence_role`, `output_candidate`, `evidence_ref`, `source_status`, `collector_snapshot_id`, `correlation_id`, optional `mapped=true|false`, optional observed/collected inclusive time windows (`observed_since`, `observed_until`, `collected_since`, `collected_until`), optional `newest_first=true`, and post-filter `limit`; blank string filters are ignored, unknown exact filter values return an empty `items` array, `mapped=true` keeps records with real non-empty `agent_id`, `mapped=false` keeps unmapped runtime records with `agent_id: null`, contradictory filters such as `mapped=false&agent_id=app-engineering` return an empty `items` array, `output_candidate`, `mapped`, and `newest_first` accept `true`/`false` via store boolean normalization, invalid `mapped` preserves existing behavior, invalid or false `newest_first` preserves append order for backward compatibility, `newest_first=true` orders by `observed_at` descending, then `collected_at` descending, then a deterministic persisted-field tie key, and invalid, negative, or missing limits follow the existing read-model limit behavior (`50` default, `200` maximum)
- evidence-record time-window filters apply only when the supplied timestamp parses as a valid ISO timestamp; invalid or blank timestamp filters are ignored, valid windows apply before `newest_first` and `limit`, and records without the target timestamp (`observed_at` for observed windows, `collected_at` for collected windows) do not match that window
- mapped Hermes profile/session rows use source kinds `hermes_profile` / `hermes_session`, `evidence_role: runtime_presence`, safe single seeded-agent `agent_id` matches, and `output_candidate: false`; duplicate Hermes profile/session matches for the same agent/source kind, or a shared Hermes evidence ref mapped to multiple agents, are unsafe, produce degraded source health with bounded reasons, and remain queryable evidence records with `agent_id: null`, `evidence_role: runtime_unmapped`, and `output_candidate: false`; unmapped tmux/Hermes runtime rows remain queryable evidence records with the same unmapped/non-output shape
- mapped task evidence rows use fixture source kinds (`kanban_fixture`, `linear_fixture`, `slack_fixture`, `task_fixture`), `evidence_role: task_reference`, seeded-agent `agent_id`, safe task `correlation_id`, and `output_candidate: false`; unmapped task evidence rows keep the same fixture source kind and `task_reference` role with `agent_id: null`, remain queryable through evidence-record filters, and never become runtime liveness/source-gap rows regardless of stored `source_status`
- opt-in Hermes runtime facts read from `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS` or legacy `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE` persist only bounded source provenance in evidence metadata: every fact may expose abstract 1-based `source_input_ordinal` and `source_file_ordinal`, JSON arrays expose `source_format: json_array` plus zero-based `source_index`, and JSONL exposes `source_format: jsonl`, zero-based `source_index`, and physical `line`; runtime `metadata` is reduced to bounded allowlisted primitives such as numeric `pid`; runtime fields, `source_provenance`, and metadata fail closed on absolute or relative local paths, generic URI refs, tmux refs, control-plane/payload keys, webhook/token-like values, or raw runtime dumps; collection error details use abstract source labels and generic field names, and must not leak configured local input paths, expanded file paths, temp roots, raw input snippets, URI refs, tmux refs, or secret-shaped canaries; raw runtime metadata/payloads are not evidence metadata
- `evidence_record` does not add a write API, control-plane surface, event count, or heartbeat count
- replaying `collector_snapshot` records restores the latest report and evidence coverage, with the last append-order snapshot winning; replaying `evidence_record` records restores collector evidence facts; snapshot replay must not duplicate events or heartbeats, and older event/heartbeat/collector-snapshot-only JSONL files still load without evidence records
- the latest collector report also exposes `shared_artifacts`, a top-level per-snapshot rollup derived only from the current collected items
- `shared_artifacts` entries appear only when at least two agents in the same snapshot mention the same `artifact_ref` and expose `artifact_ref`, `artifact_kind`, optional `file_name`, `agent_ids`, `agent_count`, `mention_count`, `last_seen_at`, and `source_kinds`
- each collector item exposes additive `source_health` for `workspace_root`, observed workspace files among `inbox.md`/`outbox.md`/`todo.md`, the expected `tmux_session`, and injected Hermes `hermes_profile` / `hermes_session` runtime source facts when that reader is enabled; missing tmux sources and duplicate/shared-ref Hermes sources must be explicit with expected refs or degraded reasons, and mapped Hermes source health remains presence/provenance evidence rather than output, task state, route selection, or liveness
- each collector item may expose additive mapped `task_evidence_observations` with canonical `task://<source_kind>/<task_ref>` evidence refs; task evidence refs are included in item, supervision, heartbeat, and coverage evidence refs but never advance heartbeat state, `last_meaningful_output_at`, `last_file_write_at`, liveness, productivity, task dispatch, or profile routing
- the latest collector report exposes additive `runtime_source_evidence.unmapped_tmux_sessions`, `runtime_source_evidence.unmapped_hermes_sources`, and `runtime_source_evidence.unmapped_task_evidence` for observed sources that do not safely match any seeded agent/session; these unmapped facts are retained as evidence, not silently dropped or promoted into office actors
- `GET /collectors/controller-snapshot/evidence-coverage` is a bounded read-only projection of the latest report's `evidence_coverage`; it does not trigger collection and does not read tmux or the filesystem
- when no latest report or no latest `evidence_coverage` exists, `GET /collectors/controller-snapshot/evidence-coverage` returns `200` with `{ "item": null }`
- `agent_id`, `source_kind`, and `confidence_level` filters exact-match coverage `agent_items`; blank filter values are ignored, and `source_kind` matches collector evidence source kinds only (`workspace_file`, `workspace_root`, `tmux_observation`, `hermes_profile`, `hermes_session`, `task_evidence`)
- `source_kind` selects agent items that mention that source kind; selected multi-source agents keep their full coverage row, so projection aggregates still describe the returned agents' complete evidence mix rather than a per-ref slice
- `limit` applies after filters; invalid, negative, or missing limits follow the existing read-model limit behavior (`50` default, `200` maximum)
- evidence-coverage projection aggregates (`evidence_ref_count`, `covered_agent_count`, `source_kind_buckets`, `low_confidence_agent_ids`) are recomputed from the filtered/limited agent item set while preserving stable snapshot order
- evidence-coverage responses include `collected_at`, top-level `collector_snapshot_id` for the latest stored collector snapshot, `actor_id`, aggregate coverage counts, source-kind buckets, low-confidence agent ids, and bounded `agent_items`
- `GET /collectors/controller-snapshot/source-health` is a bounded read-only projection of the latest report's `source_health` by default, or of the exact replayed snapshot selected by `collector_snapshot_id`; it returns `200` with `{ "item": null }` when no selected collector report exists, including unknown `collector_snapshot_id`, and never triggers collection, tmux, filesystem access, or append-only writes
- source-health filters are exact and additive: `collector_snapshot_id`, `agent_id`, `source_kind`, `status`, and post-filter `limit`; blank values are ignored, invalid or negative limits use the existing read-model default, and unknown `source_kind`/`status` values return an empty bounded projection rather than an error
- source-health `source_kind` accepts `workspace_root`, `workspace_file`, `workspace_files`, `tmux_observation`, `tmux_session`, `hermes_profile`, and `hermes_session`; `workspace_file`/`workspace_files` project `source_health.workspace_files`, `tmux_observation`/`tmux_session` project `source_health.tmux_session`, and Hermes kinds project their matching `source_health` keys
- source-health `status` matches existing `source_health` statuses (`observed`, `degraded`, `missing`, `error`) only; inbound `inbox.md`, `workspace_root`, Hermes profile/session presence, and runtime source gaps remain source/presence signals and must not imply output, liveness, state updates, task updates, or alert resolution
- source-health responses include `collected_at`, top-level `collector_snapshot_id` for the selected stored collector snapshot, `actor_id`, summary `source_kind_buckets` and `status_buckets`, bounded `agent_items`, `runtime_source_evidence.unmapped_tmux_sessions`, and `runtime_source_evidence.unmapped_hermes_sources` when present; each agent row includes `agent_id`, the same sanitized `collector_snapshot_id`, projected source-health `status`/bounded time/count fields, `evidence_ref_count`, and `latest_evidence_at` only when already derivable from the stored report; source-health responses never return raw workspace paths, tmux/Hermes/session/profile refs, evidence refs, metadata, or degraded reason arrays
- `GET /collectors/controller-snapshot/history` is a bounded read-only summary over replayed `collector_snapshot` records; it never triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions, and it does not change `GET /collectors/controller-snapshot`
- history filters are exact and additive: `collector_snapshot_id`, `agent_id`, `source_kind`, `status`, inclusive valid-ISO `collected_since`/`collected_until`, and post-filter `limit`; blank values are ignored, invalid timestamp filters are ignored, invalid or negative limits use the existing read-model default, and unknown source/status values return an empty bounded summary
- history `source_kind` accepts the same source-health aliases as source-health; responses return compact rows only: `collector_snapshot_id`, `collected_at`, `actor_id`, top-level snapshot counts, `matched_agent_count`, `source_kind_buckets`, and `status_buckets`; raw `items`, workspace/tmux/Hermes observations, runtime source evidence, paths, refs, and heartbeat payloads are not returned
- `GET /collectors/controller-snapshot/diff` is a compact read-only delta between collector snapshots; by default it compares latest vs previous, or compares explicit `from_collector_snapshot_id`/`to_collector_snapshot_id` (aliases `from`/`to`); it returns `{ "item": null }` when either side is unavailable and never triggers collection, tmux/filesystem reads, append-only writes, or control-plane actions
- diff responses include only snapshot ids/timestamps, top-level summary deltas, source-health bucket deltas, `agent_change_count`, `returned_limit`, and bounded `agent_changes` with `agent_id`, `change_type`, `heartbeat_changed`, and source-health status transitions; `heartbeat_changed` is a compatibility diff flag only and must not be presented as work, liveness, productivity, or health inference; responses never return raw snapshot items, local paths, tmux refs, evidence refs, metadata, payloads, degraded reasons, task dispatch, claim/complete state, worker orchestration, fabricated liveness/productivity, or severity inference
- collector-derived activity uses canonical event types only: `agent_state_changed` and `agent_wrote_file`
- collector-derived supervision uses existing canonical event types only: `peer_watch_alert_raised` and `peer_watch_alert_resolved`
- collector-derived `agent_state_changed` requires evidence-backed state drift versus the previously known projection and uses `tmux_observation` or `workspace_file` as the source kind
- collector-derived `agent_wrote_file` requires a newer agent-output workspace observation than the previously known projection; inbound `inbox.md` and workspace-root evidence remain coverage/provenance only
- collector staleness alerts use `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- blocked or reboot-recommended collector items raise `peer_watch_alert_raised` with evidence refs plus collector metadata; no reboot lifecycle records are fabricated yet
- repeated unchanged collector conditions must not append duplicate activity or `peer_watch_alert_raised` events
- when a previously open collector-derived alert clears in a later output/evidence-backed snapshot, append `peer_watch_alert_resolved`
- time alone must never fabricate `red`; `red` remains explicit event-driven supervision
- collector-derived activity and supervision remain queryable through `/timeline` using the same evidence/source fields as the canonical event log

## Collector evidence coverage response shape
```json
{
  "item": {
    "collected_at": "2026-03-09T18:05:00.000Z",
    "collector_snapshot_id": "collector-snapshot:2026-03-09T18:05:00.000Z",
    "actor_id": "team-lead",
    "evidence_ref_count": 2,
    "covered_agent_count": 1,
    "source_kind_buckets": {
      "workspace_file": 1,
      "workspace_root": 0,
      "tmux_observation": 1
    },
    "low_confidence_agent_ids": [],
    "agent_items": [
      {
        "agent_id": "app-engineering",
        "evidence_ref_count": 2,
        "source_kinds": ["tmux_observation", "workspace_file"],
        "latest_evidence_at": "2026-03-09T18:04:30.000Z",
        "confidence_level": "high"
      }
    ]
  }
}
```

## Collector source health response shape
```json
{
  "item": {
    "collected_at": "2026-03-09T18:05:00.000Z",
    "collector_snapshot_id": "collector-snapshot:2026-03-09T18:05:00.000Z",
    "actor_id": "team-lead",
    "summary": {
      "agent_count": 1,
      "source_kind_buckets": {
        "workspace_root": { "observed": 1, "degraded": 0, "missing": 0, "error": 0 },
        "workspace_files": { "observed": 0, "degraded": 1, "missing": 0, "error": 0 },
        "tmux_session": { "observed": 1, "degraded": 0, "missing": 0, "error": 0 }
      },
      "status_buckets": { "observed": 2, "degraded": 1, "missing": 0, "error": 0 }
    },
    "runtime_source_evidence": {
      "unmapped_tmux_sessions": []
    },
    "agent_items": [
      {
        "agent_id": "app-engineering",
        "collector_snapshot_id": "collector-snapshot:2026-03-09T18:05:00.000Z",
        "source_health": {
          "workspace_root": {
            "status": "observed",
            "last_observed_at": "2026-03-09T18:00:00.000Z"
          },
          "workspace_files": {
            "status": "degraded",
            "observed_count": 1,
            "last_observed_at": "2026-03-09T18:04:00.000Z"
          },
          "tmux_session": {
            "status": "observed",
            "observed_count": 1,
            "last_observed_at": "2026-03-09T18:04:30.000Z"
          }
        },
        "evidence_ref_count": 2,
        "latest_evidence_at": "2026-03-09T18:04:30.000Z"
      }
    ]
  }
}
```

## Agent detail query semantics
- `GET /agents/:id` returns the current agent projection plus evidence-first detail slices
- optional `limit` applies to `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_incidents`, `recent_handoffs`, and `recent_reboots`; default is `5`
- `latest_heartbeat` returns the most recent append-only heartbeat for the agent or `null`
- `open_peer_watch_alerts` is derived from unresolved peer-watch alerts, not from raw historical `peer_watch_alert_raised` events
- `recent_incidents` is derived from the same normalized read-only incident feed used by `GET /incidents`, scoped to the requested agent

## Agent detail response shape
```json
{
  "item": {
    "agent_id": "app-engineering",
    "current_state": "rebooting",
    "last_event_id": "evt_reboot_detail",
    "latest_heartbeat": {
      "agent_id": "app-engineering",
      "received_at": "2026-03-09T18:19:00.000Z"
    },
    "open_peer_watch_alerts": [
      {
        "alert_id": "evt_alert_open",
        "target_agent_id": "app-engineering",
        "observer_agent_id": "team-lead",
        "watcher_agent_ids": ["protocol-engineering"],
        "status": "open",
        "evidence_count": 1
      }
    ],
    "recent_events": [],
    "recent_interactions": [],
    "recent_incidents": [],
    "recent_handoffs": [],
    "recent_reboots": []
  }
}
```

## Agent incident query semantics
- `GET /agents/:id/incidents` is read-only and reuses the existing incident feed normalization with `:id` applied as the implicit `agent_id` filter
- supported filters are `kind`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- supported `kind` values are `peer_watch_alert`, `handoff`, and `reboot`
- `status=open` follows the same active-status alias semantics as `GET /incidents`
- `window` reuses the same normalized incident `ts` filtering semantics as `GET /incidents`
- the route returns `404` when the agent id is unknown

## Agent incident response shape
```json
{
  "agent_id": "app-engineering",
  "items": [
    {
      "incident_id": "evt_agent_incident_handoff",
      "kind": "handoff",
      "ts": "2026-03-09T18:12:00.000Z",
      "agent_id": "app-engineering",
      "actor_id": "team-lead",
      "status": "started",
      "severity": "yellow",
      "summary": "Lead started an agent incident handoff",
      "correlation_id": "corr-agent-incident-feed",
      "evidence_refs": ["/tmp/agent-incident-handoff.md"],
      "counterparty_agent_ids": ["growth-revenue"],
      "source_kind": "controller_event"
    }
  ]
}
```

## Agent workflow query semantics
- `GET /agents/:id/workflow` is read-only and aggregates the existing agent detail, incident, interaction, and timeline read models into one evidence-first response
- the route path `:id` is required and returns `404` when the agent id is unknown
- supported query params are `limit` and `window`
- `detail` reuses the existing `GET /agents/:id` item semantics, including the current detail-slice default `limit=5`
- `window` defaults to `60m` and filters only the top-level `incidents`, `interactions`, and `timeline` slices
- `limit`, when provided, caps the top-level `incidents`, `interactions`, and `timeline` slices individually using their existing ordering semantics, and is also passed through to `detail` so its recent slices keep the existing detail limit behavior
- `summary` is derived only from the returned top-level `incidents`, `interactions`, and `timeline` slices, so its counts, buckets, and `latest_activity_at` reflect the already limited/windowed response rather than hidden records
- `correlation_ids` are deduped from all returned top-level workflow slices
- `counterparty_agent_ids` are deduped from all returned top-level workflow slices: `incidents` and `timeline` contribute their `counterparty_agent_ids`, `interactions` contribute via `participant_agent_ids`, and the final workflow list excludes the focal `:id` plus `team-lead`
- no new write path, event type, or stored workflow projection is introduced

## Agent workflow response shape
```json
{
  "agent_id": "app-engineering",
  "detail": {
    "agent_id": "app-engineering",
    "current_state": "coding",
    "latest_heartbeat": null,
    "recent_events": [],
    "recent_interactions": [],
    "recent_incidents": [],
    "recent_handoffs": [],
    "recent_reboots": []
  },
  "summary": {
    "incident_count": 0,
    "interaction_count": 0,
    "event_count": 0,
    "incident_kind_buckets": {},
    "interaction_type_buckets": {},
    "event_type_buckets": {},
    "severity_buckets": {
      "normal": 0,
      "yellow": 0,
      "orange": 0,
      "red": 0
    },
    "latest_activity_at": null
  },
  "correlation_ids": [
    "corr-workflow-handoff",
    "corr-workflow-review"
  ],
  "counterparty_agent_ids": [
    "growth-revenue",
    "protocol-engineering"
  ],
  "incidents": [],
  "interactions": [],
  "timeline": []
}
```


## React operator shell consumption notes
- the current operator surface consumes `GET /office/overview`, `GET /office/operations`, `GET /agents/:id/workflow`, `GET /incidents`, `GET /timeline`, `GET /collectors/controller-snapshot`, `GET /collectors/controller-snapshot/evidence-coverage`, `GET /collectors/controller-snapshot/source-health`, `GET /runtime/source-gaps`, `GET /runtime/source-gaps/summary`, `GET /evidence-records`, `GET /accountability/replay`, `GET /memory/artifacts`, `GET /peer-watch/alerts`, and `GET /correlations/:correlation_id`; this is the current shell, not a Phase 1-only baseline
- the shell defaults to `GET /agents/:id/workflow?limit=10&window=60m` for the operator drawer slice, `GET /incidents?limit=10&window=60m` for the global incident feed, `GET /timeline?limit=10&window=60m` for replay pivots, `GET /collectors/controller-snapshot` plus collector source helper reads for source evidence, `GET /runtime/source-gaps?newest_first=true&limit=3` and `GET /runtime/source-gaps/summary?newest_first=true&limit=3` for the HUD source-gap queue, `GET /evidence-records?agent_id=<selected>&newest_first=true&limit=12` for the selected-agent Evidence ledger, `GET /memory/artifacts?limit=4&window=60m` for memory pivots, `GET /accountability/replay?limit=10&window=60m` for replay bundles, `GET /peer-watch/alerts?limit=10` for peer-watch evidence, and `GET /correlations/:correlation_id?limit=10&window=60m` when an operator opens a correlation drill-down
- the React API client also exposes `GET /runtime/source-gaps/agent-summary`, `GET /runtime/source-gaps/trend`, and `GET /runtime/source-gaps/lifecycle` for source-gap contract coverage and focused consumers; lifecycle is a bounded client helper but is not currently wired into the operator shell UI
- the selected-agent Evidence ledger may summarize already loaded evidence rows as a compact Proof Compass/basis before the detailed rows; that summary must not issue another request, expose raw local path-like evidence refs, or promote missing/degraded source presence into agent output
- requests stay same-origin by default; the React shell may optionally prefix them with `VITE_API_BASE_URL` when the backend explicitly allows that frontend origin via `CORS_ALLOWED_ORIGINS`, and local Vite development may still proxy consumed read-route prefixes to the backend via an env-configurable target
- the shell may poll these read-only routes on a ~15s cadence; no websocket or SSE contract is introduced by this slice
- the UI must surface explicit loading, empty, and error states rather than infer activity that is not present in the API
- once a poll has produced a successful overview, workflow, incident, or correlation slice, later refresh failures must keep that last-good slice visible instead of replacing it with a fatal empty/error shell


## Timeline query semantics
- timeline replay is read-only and derived directly from the append-only event log
- `GET /timeline` supports `window`, `event_id`, `agent_id`, `event_type`, `severity`, `source_kind`, `evidence_ref`, `correlation_id`, and `limit`
- `source_kind` is a read-only exact-match provenance filter over `event.source_kind`
- `evidence_ref` is a read-only exact membership filter over `event.evidence_refs`; blank or missing values keep existing behavior
- the default `window` remains `60m`
- output is always chronological ascending for replay readability
- when `limit` is provided, the server selects the most recent matching events inside the filtered window and returns that slice ascending
- each timeline item exposes `event_id`, `ts`, `agent_id`, `actor_id`, `event_type`, `severity`, `current_state`, `location`, `summary`, `correlation_id`, `counterparty_agent_ids`, `evidence_refs`, and `source_kind`
- collector-derived activity and supervision events flow through `/timeline` without rewriting their evidence refs, counterparties, or source kind

## Timeline response shape
```json
{
  "items": [
    {
      "event_id": "evt_peer_watch_replay",
      "ts": "2026-03-09T18:07:00.000Z",
      "agent_id": "app-engineering",
      "actor_id": "team-lead",
      "event_type": "peer_watch_alert_raised",
      "severity": "orange",
      "current_state": "blocked",
      "location": "review-zone",
      "summary": "Lead escalated replay ordering issue",
      "correlation_id": "corr-replay",
      "counterparty_agent_ids": ["protocol-engineering"],
      "evidence_refs": ["/tmp/replay-alert.md"],
      "source_kind": "controller_event"
    }
  ]
}
```

## Interaction query semantics
- interaction read models are derived from the existing append-only event log; there is no `POST /interactions`
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired start/completed events collapse into one interaction only when the derived interaction type, `correlation_id`, and participant lineage all match
- ambiguous or unmatched events remain single-event interaction records instead of guessed pairs
- `GET /interactions` supports `event_id`, `evidence_ref`, `interaction_type`, `counterparty_agent_id`, `severity`, `correlation_id`, `limit`, and `window`
- `GET /agents/:id/interactions` supports the same filters while treating `:id` as the implicit participant filter
- `event_id` exact-matches an interaction when it equals `trigger_event_id` or appears in `related_event_ids`; `evidence_ref` exact-matches membership in `evidence_refs`
- each interaction item exposes `interaction_id`, `interaction_type`, `correlation_id`, `started_at`, `ended_at`, `participant_agent_ids`, `trigger_event_id`, `before_state`, `after_state`, `severity`, `evidence_refs`, `summary`, and `related_event_ids`

## Peer-watch alert query semantics
- peer-watch alert queries stay read-only and derive their evidence view from canonical peer-watch events
- `GET /peer-watch/alerts` supports `status`, `target_agent_id`, backward-compatible `agent_id`, `watcher_agent_id`, `observer_agent_id`, `correlation_id`, `severity`, and `limit`
- `status=open` returns only currently unresolved alerts from the derived open-alert projection
- `status=resolved` returns historical resolution events; omitting `status` returns the full alert event history
- each alert item exposes `alert_id`, `target_agent_id`, `observer_agent_id`, `watcher_agent_ids`, `status`, `current_state`, `active_task`, `severity`, `summary`, `evidence_refs`, `evidence_count`, `correlation_id`, `source_kind`, and `metadata`

## Incident feed query semantics
- `GET /incidents` is read-only and normalizes existing peer-watch alert, handoff, and reboot read models into one operator feed
- supported `kind` values are `peer_watch_alert`, `handoff`, and `reboot`
- supported filters are `kind`, `agent_id`, `severity`, `status`, `correlation_id`, `limit`, and `window`
- output is always descending by incident timestamp
- `status=open` is an active-status alias: unresolved peer-watch `open`, handoff `waiting` / `started`, and reboot `waiting` / `started` / `requested`
- explicit closed status filters such as `status=completed` and `status=resolved` remain literal matches
- `window` filters by normalized incident `ts` relative to request time without creating a new stored incident projection
- each incident item exposes `incident_id`, `kind`, `ts`, `agent_id`, `actor_id`, `status`, `severity`, `summary`, `correlation_id`, `evidence_refs`, `counterparty_agent_ids`, and `source_kind`

## Correlation drill-down query semantics
- `GET /correlations/:correlation_id` is read-only and aggregates existing incident, interaction, and timeline/event read models into one evidence-first drill-down surface
- the route path `:correlation_id` is required and is matched against existing append-only events plus the read models derived from them
- supported query params are `limit` and `window`
- `window` reuses the existing `Nm|Nh` parsing; when omitted the drill-down keeps the full correlation history instead of forcing a default replay window
- `limit`, when provided, caps `incidents`, `interactions`, `timeline`, and `closure_ledger.entries` using their existing endpoint or newest-first ordering semantics
- `incident_count`, `interaction_count`, `event_count`, and closure ledger counts are computed from the full filtered match set before `limit` is applied
- `participant_agent_ids` and `evidence_refs` are deduped across the full filtered correlation slice
- `first_ts` and `last_ts` expose the temporal bounds of the full filtered correlation slice
- `closure_ledger` is additive and derived only from existing reads: current `status=open` incident semantics produce `open`, unended interactions produce `active`, and resolved/completed incident evidence produces `closed`
- the route returns `404` when the `correlation_id` matches no incidents, interactions, or events

## Shared memory artifact query semantics
- `GET /memory/artifacts` is read-only and derives a shared engineering-memory surface from existing event `evidence_refs` plus the latest collector workspace/tmux observations when available
- supported query params are `limit`, `window`, `agent_id`, `correlation_id`, `artifact_ref`, `event_type`, `severity`, `source_kind`, and `artifact_kind`
- the route does not create a markdown-backed status store, write path, or task-assignment surface; it reuses the append-only evidence trail already present in canonical events and collector snapshots
- items are grouped by `artifact_ref`; repeated mentions increase `mention_count` while preserving first/last observation timestamps, including matching collector observations from the latest snapshot
- `agent_id`, when present, matches artifacts mentioned by that agent, actor, or listed counterparties; collector-only observations stay agent-scoped instead of leaking other observed agents
- `correlation_id`, when present, narrows to artifacts referenced by events inside that correlation slice or the matching latest collector snapshot correlation when no derived activity event exists
- `event_type`, `severity`, `source_kind`, and `artifact_kind` are additive read-only facets; event-backed artifacts may still be extended by matching collector observations, but event-facet queries do not materialize unrelated collector-only artifacts
- `source_kind`, when present, exact-matches membership in the artifact `source_kinds` rollup before `limit`; multi-source matches keep the existing full artifact response rather than narrowing `source_kinds`, event anchors, or collector fields
- collector-only observations may expose `latest_summary`, `latest_event_type`, `latest_event_id`, and `replay_checkpoint` as `null`/omitted when the latest snapshot did not materialize a canonical activity event for that artifact
- event-backed artifacts expose optional `latest_event_id` and `replay_checkpoint` from the same newest event that supplies `latest_summary` and `latest_event_type`; collector-only artifacts do not fabricate event ids or replay checkpoints
- item ordering is newest `last_seen_at` first, then highest `mention_count`, then stable `artifact_ref`

## Accountability replay bundle semantics
- `GET /accountability/replay` is read-only and derives one bounded bundle from existing event-log, interaction, and shared-memory read models
- supported anchors are `event_id`, `evidence_id`, `evidence_ref`, `correlation_id`, and `agent_id`; at least one must be present or the route returns `400` with `missing_replay_anchor`
- `evidence_id` is a read-only accountability anchor over an existing evidence record; replay resolves it internally to the record's existing evidence/correlation/agent fields and echoes only `evidence_id` unless the caller also supplied explicit filters
- supported optional facets are `source_kind` and `artifact_kind`; `source_kind` narrows events/timeline and memory artifacts through existing read-model filters, while `artifact_kind` narrows memory artifacts
- supported bounds are `limit` and `window`; omitted bounds default to `limit=10` and `window=60m`, and the response echoes the effective values in `query` and `accountability.bounded_by`
- response shape is `{ generated_at, query, accountability, replay_audit?, ledger, events, interactions, memory_artifacts }`
- `accountability.basis` is `event_log_and_existing_read_models`; rollups include counts, participant agent ids, actor ids, evidence refs, source-kind buckets, and first/last ledger timestamps from the already bounded slice
- when `evidence_id` is supplied, `replay_audit` is a bounded sanitized status object with `evidence_id_status: "event_backed"|"collector_only"|"unknown_evidence_id"`, returned event/interaction/artifact/ledger counts, and `anchor_event_ids`/`anchor_event_count` derived only from already returned ledger `basis_event_ids`; it does not expose raw evidence refs, tmux/Hermes/session/profile/path/payload/metadata/degraded reason fields, and it does not broaden an unknown `evidence_id` into an agent-wide replay
- `ledger` entries use `entry_type` values `event`, `interaction`, or `memory_artifact`; `basis_event_ids` must contain only real existing event ids
- event-backed artifacts may cite their real `latest_event_id`; collector-only artifacts must use empty `basis_event_ids`, `provenance: "collector_observation_without_event_id"`, and no fabricated replay checkpoint
- the route does not create events, persist replay state, read tmux/filesystem data, dispatch commands, or infer evidence from file names

## Peer-watch alert response shape
```json
{
  "items": [
    {
      "alert_id": "evt_peer_watch_other",
      "target_agent_id": "market-intel",
      "observer_agent_id": "team-lead",
      "watcher_agent_ids": ["growth-revenue"],
      "status": "open",
      "current_state": "blocked",
      "active_task": "Investigate stale market notes",
      "severity": "yellow",
      "summary": "Growth revenue escalated stale evidence",
      "evidence_refs": ["/tmp/evidence-other.md"],
      "evidence_count": 1,
      "correlation_id": "corr-other",
      "source_kind": "controller_event",
      "metadata": {}
    }
  ]
}
```

## Incident feed response shape
```json
{
  "items": [
    {
      "incident_id": "evt_incident_reboot_requested",
      "kind": "reboot",
      "ts": "2026-03-09T18:18:00.000Z",
      "agent_id": "market-intel",
      "actor_id": "team-lead",
      "status": "requested",
      "severity": "red",
      "summary": "Lead requested a reboot for the incident follow-up",
      "correlation_id": "corr-incident-reboot",
      "evidence_refs": ["/tmp/incident-reboot.md"],
      "counterparty_agent_ids": [],
      "source_kind": "controller_event"
    }
  ]
}
```

## Shared memory artifact response shape
```json
{
  "generated_at": "2026-03-09T19:00:00.000Z",
  "items": [
    {
      "artifact_ref": "/tmp/app-engineering/todo.md",
      "artifact_kind": "workspace_file",
      "file_name": "todo.md",
      "first_seen_at": "2026-03-09T18:40:00.000Z",
      "last_seen_at": "2026-03-09T18:58:30.000Z",
      "mention_count": 3,
      "agent_ids": ["app-engineering", "team-lead"],
      "correlation_ids": ["corr-drilldown"],
      "source_kinds": ["controller_event", "workspace_file"],
      "latest_summary": "Lead requested a reboot after the evidence review",
      "latest_event_type": "agent_reboot_requested",
      "latest_event_id": "evt_incident_reboot_requested",
      "replay_checkpoint": {
        "event_id": "evt_incident_reboot_requested",
        "event_type": "agent_reboot_requested",
        "summary": "Lead requested a reboot after the evidence review",
        "last_seen_at": "2026-03-09T18:58:00.000Z"
      },
      "collector_last_modified_at": "2026-03-09T18:58:30.000Z"
    },
    {
      "artifact_ref": "/tmp/shared.md",
      "artifact_kind": "workspace_file",
      "file_name": "shared.md",
      "first_seen_at": "2026-03-09T18:17:00.000Z",
      "last_seen_at": "2026-03-09T18:17:00.000Z",
      "mention_count": 1,
      "agent_ids": ["app-engineering", "team-lead"],
      "correlation_ids": ["collector-snapshot:2026-03-09T18:18:00.000Z"],
      "source_kinds": ["workspace_file"],
      "latest_summary": null,
      "latest_event_type": null,
      "collector_last_modified_at": "2026-03-09T18:17:00.000Z"
    }
  ]
}
```

## Correlation drill-down response shape
```json
{
  "correlation_id": "corr-drilldown",
  "participant_agent_ids": [
    "app-engineering",
    "growth-revenue",
    "protocol-engineering",
    "team-lead"
  ],
  "evidence_refs": [
    "/tmp/corr-alert-open.md",
    "/tmp/corr-handoff-start.md",
    "/tmp/corr-reboot.md"
  ],
  "first_ts": "2026-03-09T18:06:00.000Z",
  "last_ts": "2026-03-09T18:12:00.000Z",
  "incident_count": 4,
  "interaction_count": 3,
  "event_count": 6,
  "closure_ledger": {
    "state": "open",
    "basis": "filtered_correlation_slice",
    "open_count": 2,
    "active_count": 1,
    "closed_count": 1,
    "entry_count": 4,
    "last_transition_ts": "2026-03-09T18:12:00.000Z",
    "entries": [
      {
        "entry_id": "incident:evt_corr_reboot_requested",
        "state": "open",
        "kind": "reboot",
        "status": "requested",
        "ts": "2026-03-09T18:12:00.000Z",
        "agent_id": "app-engineering",
        "actor_id": "team-lead",
        "summary": "Lead requested a reboot after the evidence review",
        "correlation_id": "corr-drilldown",
        "evidence_refs": ["/tmp/corr-reboot.md"],
        "source_kind": "controller_event",
        "incident_id": "evt_corr_reboot_requested"
      }
    ]
  },
  "incidents": [
    {
      "incident_id": "evt_corr_reboot_requested",
      "kind": "reboot",
      "ts": "2026-03-09T18:12:00.000Z",
      "agent_id": "app-engineering",
      "actor_id": "team-lead",
      "status": "requested",
      "severity": "red",
      "summary": "Lead requested a reboot after the evidence review",
      "correlation_id": "corr-drilldown",
      "evidence_refs": ["/tmp/corr-reboot.md"],
      "counterparty_agent_ids": [],
      "source_kind": "controller_event"
    }
  ],
  "interactions": [
    {
      "interaction_id": "interaction:evt_corr_handoff_started",
      "interaction_type": "handoff",
      "correlation_id": "corr-drilldown",
      "started_at": "2026-03-09T18:10:00.000Z",
      "ended_at": "2026-03-09T18:11:00.000Z",
      "participant_agent_ids": [
        "app-engineering",
        "growth-revenue",
        "team-lead"
      ],
      "trigger_event_id": "evt_corr_handoff_started",
      "before_state": "planning",
      "after_state": "planning",
      "severity": "yellow",
      "evidence_refs": [
        "/tmp/corr-handoff-start.md",
        "/tmp/corr-handoff-complete.md"
      ],
      "summary": "Lead completed the evidence handoff",
      "related_event_ids": [
        "evt_corr_handoff_started",
        "evt_corr_handoff_completed"
      ]
    }
  ],
  "timeline": [
    {
      "event_id": "evt_corr_handoff_completed",
      "ts": "2026-03-09T18:11:00.000Z",
      "agent_id": "app-engineering",
      "actor_id": "team-lead",
      "event_type": "agent_handoff_completed",
      "severity": "normal",
      "current_state": "planning",
      "location": "meeting-zone",
      "summary": "Lead completed the evidence handoff",
      "correlation_id": "corr-drilldown",
      "counterparty_agent_ids": ["growth-revenue"],
      "evidence_refs": ["/tmp/corr-handoff-complete.md"],
      "source_kind": "controller_event"
    }
  ]
}
```

## Interaction response shape
```json
{
  "items": [
    {
      "interaction_id": "interaction:evt_review_started",
      "interaction_type": "review",
      "correlation_id": "review-123",
      "started_at": "2026-03-09T18:00:00.000Z",
      "ended_at": "2026-03-09T18:05:00.000Z",
      "participant_agent_ids": ["app-engineering", "protocol-engineering", "team-lead"],
      "trigger_event_id": "evt_review_started",
      "before_state": "reviewing",
      "after_state": "reviewing",
      "severity": "yellow",
      "evidence_refs": ["/tmp/review-start.md", "/tmp/review-complete.md"],
      "summary": "Lead completed the backend review",
      "related_event_ids": ["evt_review_started", "evt_review_completed"]
    }
  ]
}
```

## Collector snapshot response shape
```json
{
  "item": {
    "collected_at": "2026-03-09T18:05:00.000Z",
    "actor_id": "team-lead",
    "summary": {
      "agent_count": 7,
      "heartbeat_count": 7,
      "tmux_observed_count": 6,
      "workspace_observed_count": 7,
      "reboot_recommended_count": 1
    },
    "evidence_coverage": {
      "evidence_ref_count": 2,
      "covered_agent_count": 1,
      "low_confidence_agent_ids": [],
      "source_kind_buckets": {
        "workspace_file": 1,
        "workspace_root": 0,
        "tmux_observation": 1
      },
      "agent_items": [
        {
          "agent_id": "app-engineering",
          "evidence_ref_count": 2,
          "source_kinds": ["tmux_observation", "workspace_file"],
          "latest_evidence_at": "2026-03-09T18:04:30.000Z",
          "confidence_level": "high"
        }
      ]
    },
    "runtime_source_evidence": {
      "unmapped_tmux_sessions": []
    },
    "items": [
      {
        "agent_id": "app-engineering",
        "source_health": {
          "workspace_root": {
            "status": "observed",
            "path": "/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace",
            "last_observed_at": "2026-03-09T18:00:00.000Z",
            "degraded_reasons": []
          },
          "workspace_files": {
            "status": "degraded",
            "expected_files": ["inbox.md", "outbox.md", "todo.md"],
            "observed_count": 1,
            "missing_count": 2,
            "error_count": 0,
            "last_observed_at": "2026-03-09T18:04:00.000Z",
            "degraded_reasons": ["missing workspace files: inbox.md, outbox.md"]
          },
          "tmux_session": {
            "status": "observed",
            "expected_session_ref": "5-web3-app-engineering",
            "observed_count": 1,
            "last_observed_at": "2026-03-09T18:04:30.000Z",
            "degraded_reasons": []
          }
        },
        "evidence_refs": [
          "/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace/todo.md",
          "tmux://5-web3-app-engineering/0.1"
        ],
        "workspace_observations": [
          {
            "path": "/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace/todo.md",
            "file_name": "todo.md",
            "evidence_role": "agent_plan",
            "kind": "workspace_file",
            "last_modified_at": "2026-03-09T18:04:00.000Z"
          }
        ],
        "tmux_observations": [
          {
            "session_name": "5-web3-app-engineering",
            "window_index": "0",
            "pane_index": "1",
            "pane_id": "%11",
            "pane_title": "Implement HTTP handlers",
            "pane_current_command": "nvim",
            "pane_active": true,
            "pane_dead": false,
            "pane_activity_at": "2026-03-09T18:04:30.000Z"
          }
        ],
        "supervision": {
          "watch_target": "growth-revenue",
          "watched_by": ["protocol-engineering", "team-lead"],
          "needs_attention": false
        },
        "heartbeat": {
          "agent_id": "app-engineering",
          "actor_id": "team-lead",
          "received_at": "2026-03-09T18:05:00.000Z",
          "current_state": "coding",
          "active_task": "Implement HTTP handlers",
          "last_meaningful_output_at": "2026-03-09T18:04:30.000Z",
          "last_file_write_at": "2026-03-09T18:04:00.000Z",
          "current_blocker": "",
          "confidence_level": "high",
          "reboot_recommended": false
        }
      }
    ]
  }
}
```

## Handoff and reboot normalization note
- handoff and reboot read models stay derived from canonical events
- their shapes now also carry `status`, `severity`, `source_kind`, and `counterparty_agent_ids` so `GET /incidents` can normalize them without a new persistence layer

## Canonical enums
### states
- `idle`
- `researching`
- `planning`
- `coding`
- `blocked`
- `reviewing`
- `sleeping`
- `rebooting`

### severities
- `normal`
- `yellow`
- `orange`
- `red`

## Office overview semantics
- `GET /office/overview` is a read-only projection for future operator UI work
- response sections are `generated_at`, `summary`, `zones`, `watch_edges`, and `agents`
- `summary` includes `agent_count`, `blocked_count`, `reboot_recommended_count`, and `severity_buckets`
- `zones` is a deterministic list of the lead desk, six agent desks, meeting zone, review zone, rest zone, and reboot zone
- each zone includes `zone_id`, `label`, `kind`, `grid_x`, `grid_y`, `grid_w`, `grid_h`, `home_agent_id`, and `occupants`
- `watch_edges` lists `{ from_agent_id, to_agent_id, watch_mode }` using the canonical peer-watch ring plus the lead supervision fan-out
- each agent overview record includes the current projection plus `reported_severity`, `derived_staleness`, and `effective_severity`
- derived staleness uses `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- missing timestamps do not auto-escalate severity
- `red` severity stays event-driven only and is never fabricated from time alone

## Office overview response shape
```json
{
  "generated_at": "2026-03-09T18:05:00.000Z",
  "summary": {
    "agent_count": 7,
    "blocked_count": 1,
    "reboot_recommended_count": 1,
    "severity_buckets": {
      "normal": 3,
      "yellow": 1,
      "orange": 2,
      "red": 1
    }
  },
  "zones": [
    {
      "zone_id": "desk-app-engineering",
      "label": "App Engineering Desk",
      "kind": "desk",
      "grid_x": 4,
      "grid_y": 1,
      "grid_w": 1,
      "grid_h": 1,
      "home_agent_id": "app-engineering",
      "occupants": [
        {
          "agent_id": "app-engineering",
          "display_name": "App Engineering Agent",
          "kind": "employee",
          "current_state": "coding",
          "active_task": "Implement HTTP handlers",
          "effective_severity": "normal"
        }
      ]
    }
  ],
  "watch_edges": [
    {
      "from_agent_id": "team-lead",
      "to_agent_id": "app-engineering",
      "watch_mode": "lead"
    },
    {
      "from_agent_id": "protocol-engineering",
      "to_agent_id": "app-engineering",
      "watch_mode": "peer"
    }
  ],
  "agents": [
    {
      "agent_id": "app-engineering",
      "current_location": "desk-app-engineering",
      "last_meaningful_output_at": "2026-03-09T18:04:00.000Z",
      "reported_severity": "normal",
      "derived_staleness": {
        "severity": "normal",
        "stale_for_ms": 60000,
        "stale_for_minutes": 1,
        "last_meaningful_output_at": "2026-03-09T18:04:00.000Z"
      },
      "effective_severity": "normal"
    }
  ]
}
```

## Office operations semantics
- `GET /office/operations` is a read-only live-operations queue derived from the existing append-only events, heartbeats, and current agent projections
- by default, the queue includes only currently active agents where `current_state` is neither `idle` nor `sleeping`
- supported query params are `limit`, `state`, `agent_id`, and `severity`
- `agent_id`, when present, narrows the queue to one agent before the existing state/severity/limit handling; omitting `state` still preserves the default active-only filter
- `state`, when present, filters by one canonical state value and replaces the default active-only filter instead of layering on top of it
- `severity`, when present, exact-matches the derived `effective_severity` (`normal`, `yellow`, `orange`, or `red`) after state filtering and before `limit` is applied
- `limit`, when present, caps the returned queue after sorting; summary counts describe the returned slice, not the pre-limit match set
- queue items reuse the same `reported_severity`, `derived_staleness`, and `effective_severity` logic as `GET /office/overview`
- `correlation_id` and `latest_event` come from the latest event for the agent when one exists; heartbeat-only agents return `null` for both fields
- queue ordering is highest effective severity first, then reboot recommended agents, then blocked agents, then newest activity, then canonical display-name tie-breaks

## Office operations response shape
```json
{
  "generated_at": "2026-03-09T18:05:00.000Z",
  "summary": {
    "item_count": 2,
    "blocked_count": 1,
    "reboot_recommended_count": 0,
    "state_buckets": {
      "blocked": 1,
      "reviewing": 1
    },
    "severity_buckets": {
      "normal": 1,
      "yellow": 0,
      "orange": 1,
      "red": 0
    }
  },
  "items": [
    {
      "agent_id": "app-engineering",
      "display_name": "App Engineering Agent",
      "kind": "employee",
      "current_state": "blocked",
      "active_task": "Hand off the contract fix",
      "current_blocker": "Need review evidence",
      "current_location": "desk-app-engineering",
      "reported_severity": "orange",
      "effective_severity": "orange",
      "derived_staleness": {
        "severity": "normal",
        "stale_for_ms": 120000,
        "stale_for_minutes": 2,
        "last_meaningful_output_at": "2026-03-09T18:58:00.000Z"
      },
      "reboot_recommended": false,
      "last_event_at": "2026-03-09T18:48:00.000Z",
      "last_heartbeat_at": "2026-03-09T18:58:30.000Z",
      "last_meaningful_output_at": "2026-03-09T18:58:00.000Z",
      "correlation_id": "corr-contract",
      "latest_event": {
        "event_id": "evt_contract_handoff_completed",
        "event_type": "agent_handoff_completed",
        "ts": "2026-03-09T18:48:00.000Z",
        "summary": "Lead completed the contract handoff",
        "source_kind": "controller_event",
        "evidence_refs": ["/tmp/contract-handoff.md"],
        "counterparty_agent_ids": ["growth-revenue"]
      }
    }
  ]
}
```

## Event payload minimum
```json
{
  "event_id": "evt_123",
  "ts": "2026-03-09T18:00:00+08:00",
  "agent_id": "app-engineering",
  "agent_role": "app-engineering",
  "event_type": "agent_wrote_file",
  "current_state": "coding",
  "active_task": "Draft evidence-spine API handlers",
  "summary": "Updated server.js",
  "severity": "normal",
  "correlation_id": "evidence-spine-backend",
  "counterparty_agent_ids": [],
  "evidence_refs": [
    "<repo>/src/server.js"
  ],
  "source_kind": "workspace_file",
  "metadata": {}
}
```

## Collector-derived peer-watch event notes
- source kind stays `controller_event`
- event metadata must mark the alert as collector-derived and include evidence-backed context such as:
  - `collector_alert_family`
  - `collector_alert_signature`
  - `collected_at`
  - `last_meaningful_output_at`
  - `current_blocker`
  - `reboot_recommended`
  - `derived_staleness`
- collector-derived peer-watch events must be visible through the existing `/events`, `/timeline`, `/peer-watch/alerts`, and agent projection queries
- collector-derived peer-watch events do not count as new agent output for `last_meaningful_output_at`; that field still comes from heartbeat evidence

## Heartbeat payload minimum
```json
{
  "agent_id": "app-engineering",
  "current_state": "coding",
  "active_task": "Draft evidence-spine API handlers",
  "last_meaningful_output_at": "2026-03-09T18:00:00+08:00",
  "last_file_write_at": "2026-03-09T18:00:00+08:00",
  "current_blocker": "",
  "confidence_level": "medium",
  "reboot_recommended": false
}
```
