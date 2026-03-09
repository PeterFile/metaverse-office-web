# Metaverse Office Web

Updated: 2026-03-09T20:05:00+08:00

This repository is the implementation home for the Hermes-Agent metaverse-office project.

## Project rules
- repo root must stay under `/Users/cwp/Projects/metaverse-office-web`
- implementation follows `/Users/cwp/.hermes/teams/web3-company/controller/phase1-spec-package.md`
- Phase 1 is schema-first and evidence-first
- UI work must not outrun event/state/storage/query architecture
- no fake animation, no token layer, no onchain dependency for Phase 1

## Current milestone
- Phase 1 spec is review-ready in the controller workspace
- repo-local spec mirror and implementation plan exist
- minimal Phase 1 backend scaffold now exists for agent/event/timeline queries
- scaffold is aligned to the canonical seven-actor roster and controlled write boundaries
- office overview query now exposes zone layout, occupants, watch edges, and derived staleness for future UI work

## Key documents
- `specs/phase1-spec.md`
- `specs/api-contract.md`
- `docs/plans/phase1-kickoff-plan.md`
- `docs/adr/0001-phase1-stack.md`
- `notes/source-documents.md`

## Backend scaffold
- runtime: plain Node.js built-ins only
- storage: append-only local JSONL file at `data/prototype-store.jsonl`
- seed domain: 6 employee agents plus `team-lead`
- canonical employee ids:
  - `market-intel`
  - `product-pmf`
  - `tokenomics`
  - `protocol-engineering`
  - `app-engineering`
  - `growth-revenue`

### Run
```bash
npm test
npm start
```

Optional env:
- `PORT=3000`
- `METAVERSE_OFFICE_STORE_FILE=/absolute/path/prototype-store.jsonl`

### API
- `GET /health`
- `GET /agents`
- `GET /agents/:id`
- `GET /agents/:id/events`
- `GET /events`
- `GET /office/overview`
- `GET /timeline`
- `GET /peer-watch/alerts`
- `GET /handoffs`
- `GET /reboots`
- `POST /events`
- `POST /heartbeats`

### Office overview notes
- `GET /office/overview` returns `generated_at`, `summary`, `zones`, `watch_edges`, and `agents`
- zone metadata is canonical and deterministic; the server does not invent layout data at request time
- `effective_severity` can rise to `yellow` or `orange` from `last_meaningful_output_at`
- staleness thresholds are `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- `red` remains event-driven only

### Controlled write rule
Prototype writes require `x-actor-id: <agent_id>`.
This keeps employee writes self-scoped and reserves cross-agent supervision/handoff/reboot events for `team-lead`.
