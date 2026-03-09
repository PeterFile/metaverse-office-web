# Phase 1 API Contract Draft

## Read APIs
- `GET /health`
- `GET /agents`
- `GET /agents/:id`
- `GET /agents/:id/events?limit=&event_type=&severity=&correlation_id=`
- `GET /events?agent_id=&event_type=&severity=&correlation_id=&limit=`
- `GET /office/overview`
- `GET /timeline?window=60m`
- `GET /peer-watch/alerts?severity=`
- `GET /handoffs`
- `GET /reboots`

## Write APIs
- `POST /events`
- `POST /heartbeats`

## Prototype write control
- all write requests must send `x-actor-id: <agent_id>`
- employee agents may emit only self-scoped events and heartbeats for their own `agent_id`
- the team lead/controller may emit cross-agent supervision, handoff, reboot, review, and meeting events
- event location is system-derived from event/state mapping; callers must not control office placement

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

## Event payload minimum
```json
{
  "event_id": "evt_123",
  "ts": "2026-03-09T18:00:00+08:00",
  "agent_id": "app-engineering",
  "agent_role": "app-engineering",
  "event_type": "agent_wrote_file",
  "current_state": "coding",
  "active_task": "Draft Phase 1 API handlers",
  "summary": "Updated server.js",
  "severity": "normal",
  "correlation_id": "phase1-backend",
  "counterparty_agent_ids": [],
  "evidence_refs": [
    "/Users/cwp/Projects/metaverse-office-web/src/server.js"
  ],
  "source_kind": "workspace_file",
  "metadata": {}
}
```

## Heartbeat payload minimum
```json
{
  "agent_id": "app-engineering",
  "current_state": "coding",
  "active_task": "Draft Phase 1 API handlers",
  "last_meaningful_output_at": "2026-03-09T18:00:00+08:00",
  "last_file_write_at": "2026-03-09T18:00:00+08:00",
  "current_blocker": "",
  "confidence_level": "medium",
  "reboot_recommended": false
}
```
