# Phase 1 API Contract Draft

## Read APIs
- `GET /health`
- `GET /agents`
- `GET /agents/:id?limit=`
- `GET /agents/:id/events?limit=&event_type=&severity=&correlation_id=`
- `GET /agents/:id/interactions?interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /collectors/controller-snapshot`
- `GET /events?agent_id=&event_type=&severity=&correlation_id=&limit=`
- `GET /interactions?interaction_type=&counterparty_agent_id=&severity=&correlation_id=&limit=&window=`
- `GET /office/overview`
- `GET /timeline?window=60m`
- `GET /peer-watch/alerts?status=&target_agent_id=&agent_id=&watcher_agent_id=&observer_agent_id=&correlation_id=&severity=&limit=`
- `GET /handoffs`
- `GET /reboots`

## Write APIs
- `POST /events`
- `POST /heartbeats`
- `POST /collectors/controller-snapshot`

## Prototype write control
- all write requests must send `x-actor-id: <agent_id>`
- employee agents may emit only self-scoped events and heartbeats for their own `agent_id`
- the team lead/controller may emit cross-agent supervision, handoff, reboot, review, and meeting events
- `POST /collectors/controller-snapshot` is controller-only and must send `x-actor-id: team-lead`
- event location is system-derived from event/state mapping; callers must not control office placement

## Collector snapshot semantics
- `GET /collectors/controller-snapshot` is read-only and returns `{ "item": null }` until a snapshot has been collected
- `POST /collectors/controller-snapshot` triggers one controller snapshot, persists collected heartbeats, and may append collector-derived canonical activity and peer-watch events into the existing append-only event store
- collected heartbeat fields are derived from real workspace file metadata (`inbox.md`, `outbox.md`, `todo.md`) and tmux pane metadata for the canonical seven-actor roster
- the collector must not fabricate random activity, random severity, or random timestamps
- the latest collector report is an in-memory read model; heartbeat storage stays backward compatible as append-only `heartbeat` records
- collector-derived activity uses canonical event types only: `agent_state_changed` and `agent_wrote_file`
- collector-derived supervision uses existing canonical event types only: `peer_watch_alert_raised` and `peer_watch_alert_resolved`
- collector-derived `agent_state_changed` requires evidence-backed state drift versus the previously known projection and uses `tmux_observation` or `workspace_file` as the source kind
- collector-derived `agent_wrote_file` requires a newer `last_file_write_at` than the previously known projection and binds to the newest relevant workspace-file evidence
- collector staleness alerts use `last_meaningful_output_at` only: `<20m = normal`, `>=20m = yellow`, `>=30m = orange`
- blocked or reboot-recommended collector items raise `peer_watch_alert_raised` with evidence refs plus collector metadata; no reboot lifecycle records are fabricated yet
- repeated unchanged collector conditions must not append duplicate activity or `peer_watch_alert_raised` events
- when a previously open collector-derived alert clears in a later snapshot, append `peer_watch_alert_resolved`
- time alone must never fabricate `red`; `red` remains explicit event-driven supervision

## Agent detail query semantics
- `GET /agents/:id` returns the current agent projection plus evidence-first detail slices
- optional `limit` applies to `open_peer_watch_alerts`, `recent_events`, `recent_interactions`, `recent_handoffs`, and `recent_reboots`; default is `5`
- `latest_heartbeat` returns the most recent append-only heartbeat for the agent or `null`
- `open_peer_watch_alerts` is derived from unresolved peer-watch alerts, not from raw historical `peer_watch_alert_raised` events

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
    "recent_handoffs": [],
    "recent_reboots": []
  }
}
```

## Interaction query semantics
- interaction read models are derived from the existing append-only event log; there is no `POST /interactions`
- supported interaction types are `question_reply`, `review`, `handoff`, `peer_watch`, and `meeting`
- paired start/completed events collapse into one interaction only when the derived interaction type, `correlation_id`, and participant lineage all match
- ambiguous or unmatched events remain single-event interaction records instead of guessed pairs
- `GET /interactions` supports `interaction_type`, `counterparty_agent_id`, `severity`, `correlation_id`, `limit`, and `window`
- `GET /agents/:id/interactions` supports the same filters while treating `:id` as the implicit participant filter
- each interaction item exposes `interaction_id`, `interaction_type`, `correlation_id`, `started_at`, `ended_at`, `participant_agent_ids`, `trigger_event_id`, `before_state`, `after_state`, `severity`, `evidence_refs`, `summary`, and `related_event_ids`

## Peer-watch alert query semantics
- peer-watch alert queries stay read-only and derive their evidence view from canonical peer-watch events
- `GET /peer-watch/alerts` supports `status`, `target_agent_id`, backward-compatible `agent_id`, `watcher_agent_id`, `observer_agent_id`, `correlation_id`, `severity`, and `limit`
- `status=open` returns only currently unresolved alerts from the derived open-alert projection
- `status=resolved` returns historical resolution events; omitting `status` returns the full alert event history
- each alert item exposes `alert_id`, `target_agent_id`, `observer_agent_id`, `watcher_agent_ids`, `status`, `current_state`, `active_task`, `severity`, `summary`, `evidence_refs`, `evidence_count`, `correlation_id`, `source_kind`, and `metadata`

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
    "items": [
      {
        "agent_id": "app-engineering",
        "evidence_refs": [
          "/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace/todo.md",
          "tmux://5-web3-app-engineering/0.1"
        ],
        "workspace_observations": [
          {
            "path": "/Users/cwp/.hermes/teams/web3-company/agents/app-engineering/workspace/todo.md",
            "file_name": "todo.md",
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
  "active_task": "Draft Phase 1 API handlers",
  "last_meaningful_output_at": "2026-03-09T18:00:00+08:00",
  "last_file_write_at": "2026-03-09T18:00:00+08:00",
  "current_blocker": "",
  "confidence_level": "medium",
  "reboot_recommended": false
}
```
