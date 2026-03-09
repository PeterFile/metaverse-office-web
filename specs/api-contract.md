# Phase 1 API Contract Draft

## Read APIs
- `GET /health`
- `GET /agents`
- `GET /agents/:id`
- `GET /agents/:id/events?limit=&event_type=&severity=&correlation_id=`
- `GET /events?agent_id=&event_type=&severity=&correlation_id=&limit=`
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
