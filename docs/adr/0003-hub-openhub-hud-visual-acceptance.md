# ADR 0003: Hub/OpenHub HUD layering and visual acceptance

Date: 2026-04-25
Status: accepted

## Context

The operator shell is becoming the main surface for supervising an engineering AI metaverse office. Recent closeout work made the incident, correlation, active queue, and supervision evidence richer, but the Hub risk is now clear: a single right-side sheet can turn into a long dashboard column that hides priority work and weakens the spatial world metaphor.

External references reviewed for this decision:
- RimWorld / colony-sim inspect panels: persistent compact state plus contextual drilldown.
- Oxygen Not Included overlays: map layers expose diagnostic state without covering the world.
- Gather / WorkAdventure spatial office patterns: interactions should preserve spatial context and avoid large opaque interruptions.
- AI Town-style world surface: the world remains the primary coordination object, not a decorative background.
- NN/g progressive disclosure / overlay guidance: avoid dumping all detail into one long scrolling panel.

## Decision

Hub/OpenHub must be treated as an evidence and attention layer over the world, not as a generic dashboard.

Accepted UI direction:
- keep the world visible and immediately draggable by default
- expose priority operator objects in the Hub first fold, especially the active queue
- use compact persistent HUD elements for glanceable status
- use contextual inspect peeks, tabbed drilldown sheets, or focused dialogs for deeper evidence instead of one ever-growing right rail
- use map overlays for attention, incidents, correlation, freshness, replay, and memory layers when the information is spatial
- keep `correlation_id` and incident/evidence provenance as the drilldown spine

Rejected direction:
- long right-side Hub columns as the default place for every new record type
- full-screen routine modals that hide the world for normal inspection
- stacked popups with no clear focus or dismissal model
- XP, score, leaderboard, or fake game-progress mechanics
- SaaS-dashboard grids that ignore spatial/evidence context

## Visual acceptance rules

Browser smoke coverage must include real browser geometry checks for Hub/OpenHub changes. The current guardrail is `apps/web/e2e/operator-shell.layout-visual.smoke.spec.ts` and it is included in `apps/web/scripts/run-browser-smoke.mjs` by default.

Minimum checks for Hub/OpenHub UI slices:
- Hub first fold exposes `Crew Overview`, `Active Queue`, and the first active queue action without scrolling.
- Hub sheet stays a side sheet, not a world-covering modal.
- The primary world drag lane remains visually clear while Hub is open.
- Closing Hub returns to a draggable world viewport.
- Key controls such as `Close Hub` and `Reset view` stay reachable by role-based locators.

Future UI slices may tighten these thresholds, but must not weaken them without a replacement visual contract.

## Consequences

- New Hub content needs an information-architecture decision: first fold, inspect peek, tab, focused dialog, or map overlay.
- Product changes that add rich evidence should also decide where the evidence lives spatially.
- Browser-smoke runtime will grow slightly because visual layout is now a real acceptance surface; this is intentional and should be offset later by CI parallelization rather than by removing visual proof.
