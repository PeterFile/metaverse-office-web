# Repo-local Phase 1 Spec Mirror

Source of truth: `/Users/cwp/.hermes/teams/web3-company/controller/phase1-spec-package.md`
Last mirrored: 2026-03-09T18:29:40+08:00

This repository mirrors the controller-approved Phase 1 scope so implementation stays under `/Users/cwp/Projects/metaverse-office-web` instead of `~/.hermes/teams/...`.

## Frozen decisions
- Phase 1 is a real-event-driven 2D office observability console
- Primary user is the internal team lead
- No 3D, no fake animation, no token layer, no onchain requirement
- Event/state architecture comes before UI polish
- Polling first, SSE second, WebSocket later only if justified

## Minimum deliverables
- append-only event ingestion boundary
- queryable agent/event/timeline/alert/handoff/reboot views
- evidence binding to files and tmux observations
- repo-local implementation plan and backend scaffold

## Canonical state enum
- idle
- researching
- planning
- coding
- blocked
- reviewing
- sleeping
- rebooting

## Canonical event types
- agent_started
- agent_stopped
- agent_state_changed
- agent_received_task
- agent_opened_file
- agent_wrote_file
- agent_asked_question
- agent_replied
- meeting_started
- meeting_ended
- review_started
- review_completed
- peer_watch_alert_raised
- peer_watch_alert_resolved
- agent_handoff_started
- agent_handoff_completed
- agent_memory_warning
- agent_hallucination_suspected
- agent_context_degraded
- agent_reboot_requested
- agent_reboot_completed
