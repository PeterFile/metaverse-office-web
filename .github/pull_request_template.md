## Summary

- Linear:
- Change:

## Delivery Gate

- [ ] PR title is conventional (`type(scope): subject` or `type: subject`) and does not use an `MYC` prefix.
- [ ] Body includes the relevant Linear issue ID(s).
- [ ] Live Evidence Spine score gate reviewed: product fit, scope control, contract integrity, tests, docs durability, delivery risk.
- [ ] Docs impact is either included in durable docs (`README`, `specs/api-contract.md`, `docs/current-direction.md`, ADR/runbook) or explicitly not applicable.
- [ ] No progress markdown, temporary route status, roadmap dump, or unrelated docs churn.

## Validation

- [ ] Layer A: focused unit/contract checks:
- [ ] Layer B: integration/API or UI checks:
- [ ] Layer C: smoke/build/regression checks:
- [ ] `pnpm verify:quick -- --lane=docs`

## Product Boundary

- [ ] Evidence-first operator world only: no task dispatch, claim/complete, assign, route, writeback, Kanban control plane, profile routing, worker orchestration, or liveness/productivity/severity inference.
- [ ] Public UI/API/docs do not expose raw evidence refs, local paths, tmux/Hermes/session/profile refs, tokens, webhooks, payloads, metadata dumps, or degraded reason arrays.
- [ ] Stack/base info is recorded for review:
  - Base branch/sha:
  - Stack parent / lower PR (if any):
  - Worktree branch:
