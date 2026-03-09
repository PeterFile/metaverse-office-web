# ADR 0001: Phase 1 stack and sequencing

Date: 2026-03-09
Status: accepted

## Context
The project needs a first implementation milestone quickly, but the user explicitly requires that UI work must not outrun the event/state architecture.

## Decision
- keep the initial backend scaffold minimal and local-first
- model the domain explicitly: states, events, heartbeats, alerts, handoffs, reboots
- ship a small read/write API before any rich visual office surface
- prefer polling-friendly JSON endpoints now; reserve SSE for later if needed
- keep persistence boundaries simple so Phase 1 can start small and migrate later

## Consequences
- fast iteration
- low ceremony
- fewer moving parts while the schema is still settling
- the first milestone proves the operational spine, not the shiny shell
