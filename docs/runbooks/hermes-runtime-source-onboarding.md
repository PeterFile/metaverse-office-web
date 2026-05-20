# Hermes Runtime Source Onboarding

Updated: 2026-05-20T00:00:00+08:00

This is the durable contract for adding Hermes runtime source files to Metaverse Office Web.

## Purpose and Boundary

Hermes runtime sources are evidence-only inputs for collector snapshots. They prove that a sanitized Hermes profile or session fact was observed by the controller environment.

They must not imply:

- task dispatch, task completion, or task ownership
- writable Kanban/control-plane behavior
- profile routing or worker orchestration
- liveness, productivity, severity escalation, or meaningful output
- access to raw prompts, payloads, transcripts, local paths, tmux internals, secrets, or environment values

Runtime presence is provenance. Output still comes from evidence-backed event, heartbeat, workspace-file, or tmux activity semantics already defined in `specs/api-contract.md`.

## Input Files

Enable ingestion only with one of these environment variables:

- `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS`: preferred, `path.delimiter`-separated files or directories
- `METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_FILE`: legacy single file; ignored when `PATHS` is set

Directories expand local `.json` and `.jsonl` files in stable lexical order. Unset variables preserve empty Hermes runtime input.

Every accepted fact gets bounded provenance only: `source_input_ordinal` is the 1-based configured input position, `source_file_ordinal` is the 1-based expanded file read position, `source_format` is `json_array` or `jsonl`, `source_index` is the zero-based fact index within that file format, and JSONL also includes physical `line`. These are abstract ordinals, not filesystem paths.

Missing files, unreadable files, invalid JSON/JSONL, invalid facts, or unsupported source kinds fail the collection request before any event, heartbeat, evidence-record, or collector-snapshot append.

## Supported Facts

JSON files contain an array of fact objects:

```json
[
  {
    "source_kind": "hermes_profile",
    "agent_id": "app-engineering",
    "profile_id": "profile-app-engineering",
    "observed_at": "2026-03-09T18:02:00.000Z"
  },
  {
    "source_kind": "hermes_session",
    "session_ref": "session-app-engineering",
    "status": "degraded",
    "observed_at": "2026-03-09T18:03:00.000Z",
    "degraded_reasons": ["session heartbeat stale"]
  }
]
```

JSONL files contain one fact object per line:

```jsonl
{"source_kind":"hermes_profile","agent_id":"product-pmf","profile_id":"profile-product-pmf","observed_at":"2026-03-09T18:04:00.000Z"}
{"source_kind":"hermes_session","session_ref":"session-product-pmf","observed_at":"2026-03-09T18:05:00.000Z"}
```

Explicit sanitized refs are allowed when they do not reveal local topology:

```json
{
  "source_kind": "hermes_profile",
  "agent_id": "growth-revenue",
  "evidence_ref": "hermes://profile/profile-growth-revenue",
  "observed_at": "2026-03-09T18:06:00.000Z"
}
```

## Field Contract

Required:

- `source_kind`: exactly `hermes_profile` or `hermes_session`
- one of:
  - sanitized `evidence_ref`
  - `agent_id` or `profile_id` for `hermes_profile`
  - `session_ref` for `hermes_session`

Optional:

- `agent_id`: seeded office agent id; maps `hermes_profile` facts only when it matches a known agent
- `profile_id`: sanitized profile identifier; may derive `hermes://profile/<profile_id>`
- `session_ref`: sanitized session identifier; maps `hermes_session` facts only when it matches a known seeded session
- `observed_at` or `last_observed_at`: valid ISO timestamp
- `status`: one of `observed`, `degraded`, `missing`, `error`; defaults to `observed`
- `degraded_reasons`: string array, sanitized and bounded
- `metadata`: sanitized object only; never raw runtime payload

Forbidden:

- local absolute paths or contributor roots
- raw prompts, transcripts, payload dumps, screenshots, stack dumps, or request/response bodies
- secrets, tokens, cookies, API keys, private keys, `.env` values, or credentials
- unsafe tmux references, pane titles, pane commands, or session names that expose local/user data
- task ids, Kanban states, assignees, route selections, or profile-control instructions when used as claims of control-plane state
- mutable commands or desired actions for the controller

Allowed claims:

- a profile or session source was observed
- the source was degraded, missing, or errored
- the source could not be safely mapped
- a duplicate or shared evidence ref made mapping unsafe

Not allowed claims:

- an agent is live, productive, blocked, complete, assigned, routed, or dispatchable because a Hermes source exists
- a source gap changes incident severity
- unmapped evidence should create a new office actor

## Mapping and Fail-Closed Behavior

Mapped profile facts use:

- `source_kind: hermes_profile`
- `evidence_role: runtime_presence`
- `output_candidate: false`
- a known seeded `agent_id`

Mapped session facts use:

- `source_kind: hermes_session`
- `evidence_role: runtime_presence`
- `output_candidate: false`
- a `session_ref` that maps to exactly one seeded agent

Missing, degraded, unmapped, duplicate, and shared-ref sources stay evidence-only:

- missing/degraded/error rows remain source-health gaps
- unmapped runtime facts use `agent_id: null`, `evidence_role: runtime_unmapped`, and `output_candidate: false`
- duplicate facts for the same agent/source kind are degraded and retained as unmapped evidence
- one Hermes evidence ref shared across multiple agents is degraded and retained as unmapped evidence
- shared refs must not be split, guessed, or promoted into actor liveness

Fail closed. If the fact cannot be parsed, validated, sanitized, or safely mapped, do not fabricate output, heartbeat, task state, liveness, or office actors.

## Redaction Rules

Before writing a source file:

- replace local paths with stable logical refs such as `hermes://profile/profile-app-engineering`
- replace session names that reveal local topology with stable sanitized `session_ref` values
- omit raw payloads and keep only bounded status/provenance fields
- omit prompt text, model messages, shell commands, tmux pane content, and transcripts
- omit secrets, tokens, env vars, auth headers, cookies, and credentials
- keep `degraded_reasons` short and generic, for example `session heartbeat stale`
- keep metadata optional and sanitized; prefer no metadata unless a read model requires it

Collection errors must use abstract source labels and must not expose configured input paths, expanded file paths, temp roots, or raw input snippets.

## Validation

Use a disposable store when validating source files locally:

```bash
METAVERSE_OFFICE_STORE_FILE=.tmp/hermes-runtime-onboarding-store.jsonl \
METAVERSE_OFFICE_HERMES_RUNTIME_SOURCES_PATHS=.tmp/hermes-runtime-sources \
PORT=3000 \
pnpm backend:start
```

Trigger collection only in a non-production, disposable environment:

```bash
curl -sS -X POST \
  -H 'x-actor-id: team-lead' \
  http://127.0.0.1:3000/collectors/controller-snapshot
```

Then verify through read-only endpoints:

```bash
curl -sS http://127.0.0.1:3000/collectors/controller-snapshot
curl -sS 'http://127.0.0.1:3000/evidence-records?source_kind=hermes_profile&limit=20'
curl -sS 'http://127.0.0.1:3000/evidence-records?source_kind=hermes_session&limit=20'
curl -sS 'http://127.0.0.1:3000/runtime/source-gaps?source_kind=hermes_profile&newest_first=true&limit=20'
curl -sS 'http://127.0.0.1:3000/runtime/source-gaps?source_kind=hermes_session&newest_first=true&limit=20'
```

Acceptance checks:

- mapped Hermes evidence has `runtime_presence` and `output_candidate: false`
- unmapped Hermes evidence has `agent_id: null`, `runtime_unmapped`, and `output_candidate: false`
- source gaps omit raw evidence ids, raw refs, metadata, payloads, paths, and tmux refs
- controller snapshot source health shows missing/degraded/error states explicitly
- no event count, heartbeat count, incident severity, task state, or meaningful-output timestamp changes merely because a Hermes profile/session exists

## Representation Rules

Represent uncertainty directly:

- Missing source: `status: "missing"` with a sanitized reason if useful.
- Degraded source: `status: "degraded"` with bounded `degraded_reasons`.
- Error source: fail collection for invalid input; use `status: "error"` only for a sanitized source fact that the owning controller can still represent safely.
- Unmapped source: keep `agent_id` absent or unknown and let it surface as runtime source evidence, not as a new actor.
- Duplicate source: keep the duplicate facts; the collector degrades mapping instead of choosing one.
- Shared-ref source: keep the shared ref evidence; the collector treats cross-agent sharing as unsafe.

Never fill missing fields with guessed values. Empty evidence is better than fake output.
