import { describe, expect, it } from 'vitest';

import {
  deriveCollectorEvidenceCoverageFocusItems,
  deriveCollectorEvidenceCoverageFocusSummary,
  deriveCollectorEvidenceCoverageViewModel
} from './evidenceCoverage';
import type { CollectorEvidenceCoverage } from '../types';

type CoverageWithRefs = CollectorEvidenceCoverage & {
  agent_items: Array<
    CollectorEvidenceCoverage['agent_items'][number] & {
      evidence_refs?: string[];
    }
  >;
};

function buildCoverage(): CoverageWithRefs {
  return {
    collected_at: '2026-03-09T18:05:00.000Z',
    collector_snapshot_id: 'collector-snapshot:2026-03-09T18:05:00.000Z',
    actor_id: 'team-lead',
    evidence_ref_count: 4,
    covered_agent_count: 2,
    low_confidence_agent_ids: [' growth-revenue ', 'growth-revenue', ''],
    source_kind_buckets: {
      workspace_file: 2,
      workspace_root: 0,
      tmux_observation: 2,
      hermes_profile: 1
    },
    agent_items: [
      {
        agent_id: ' growth-revenue ',
        evidence_ref_count: 2,
        evidence_refs: [' /tmp/growth.md ', '/tmp/growth.md', '', '/tmp/tmux.log'],
        source_kinds: ['tmux_observation', ' workspace_file ' as 'workspace_file', 'tmux_observation'],
        latest_evidence_at: '2026-03-09T18:04:30.000Z',
        confidence_level: 'medium'
      },
      {
        agent_id: 'app-engineering',
        evidence_ref_count: 2,
        evidence_refs: ['/tmp/app.md', ' /tmp/app.log '],
        source_kinds: ['workspace_file', 'tmux_observation'],
        latest_evidence_at: '2026-03-09T18:04:45.000Z',
        confidence_level: 'high'
      },
      {
        agent_id: ' empty-count-only ',
        evidence_ref_count: 3,
        source_kinds: ['workspace_file'],
        latest_evidence_at: '2026-03-09T18:04:50.000Z',
        confidence_level: 'high'
      }
    ]
  };
}

describe('deriveCollectorEvidenceCoverageViewModel', () => {
  it('returns an unavailable empty model for null and undefined coverage', () => {
    const unavailable = {
      status: 'coverage_unavailable',
      collected_at: null,
      actor_id: null,
      counts: {
        covered_agent_count: 0,
        uncovered_agent_count: 0,
        low_confidence_agent_count: 0,
        evidence_ref_count: 0
      },
      source_kind_buckets: [],
      rows: []
    };

    expect(deriveCollectorEvidenceCoverageViewModel(null)).toEqual(unavailable);
    expect(deriveCollectorEvidenceCoverageViewModel(undefined)).toEqual(unavailable);
  });

  it('derives stable rows from real evidence refs without mutating inputs', () => {
    const coverage = buildCoverage();
    const originalCoverage = JSON.parse(JSON.stringify(coverage));

    const viewModel = deriveCollectorEvidenceCoverageViewModel(coverage, [
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'sales', display_name: 'Sales Agent' }
    ]);

    expect(coverage).toEqual(originalCoverage);
    expect(viewModel).toMatchObject({
      status: 'coverage_available',
      collected_at: '2026-03-09T18:05:00.000Z',
      actor_id: 'team-lead',
      counts: {
        covered_agent_count: 2,
        uncovered_agent_count: 1,
        low_confidence_agent_count: 1,
        evidence_ref_count: 4
      },
      source_kind_buckets: [
        { source_kind: 'tmux_observation', count: 2 },
        { source_kind: 'workspace_file', count: 2 },
        { source_kind: 'hermes_profile', count: 1 },
        { source_kind: 'workspace_root', count: 0 }
      ]
    });
    expect(viewModel.rows.map((row) => row.agent_id)).toEqual([
      'app-engineering',
      'empty-count-only',
      'growth-revenue',
      'sales'
    ]);
    expect(viewModel.rows[0]).toMatchObject({
      agent_id: 'app-engineering',
      display_name: 'App Engineering Agent',
      evidence_refs: ['/tmp/app.log', '/tmp/app.md'],
      evidence_ref_count: 2,
      source_kinds: ['tmux_observation', 'workspace_file'],
      latest_evidence_at: '2026-03-09T18:04:45.000Z',
      confidence: 'high',
      status: 'evidence_backed',
      warning: null
    });
    expect(viewModel.rows[2]).toMatchObject({
      agent_id: 'growth-revenue',
      display_name: 'Growth Revenue Agent',
      evidence_refs: ['/tmp/growth.md', '/tmp/tmux.log'],
      evidence_ref_count: 2,
      source_kinds: ['tmux_observation', 'workspace_file'],
      confidence: 'medium',
      status: 'low_confidence_evidence'
    });
    expect(viewModel.rows[2].warning).toContain('low-confidence');
    expect(viewModel.rows[0].evidence_refs).not.toBe(coverage.agent_items[1].evidence_refs);
  });

  it('treats count-only coverage items as evidence-backed without inventing refs', () => {
    const coverage = buildCoverage();

    const viewModel = deriveCollectorEvidenceCoverageViewModel(coverage, [
      { agent_id: 'empty-count-only', display_name: 'Count Only Agent' },
      { agent_id: 'sales', display_name: 'Sales Agent' }
    ]);

    expect(viewModel.rows.find((row) => row.agent_id === 'empty-count-only')).toMatchObject({
      display_name: 'Count Only Agent',
      evidence_refs: [],
      evidence_ref_count: 3,
      source_kinds: ['workspace_file'],
      latest_evidence_at: '2026-03-09T18:04:50.000Z',
      confidence: 'high',
      status: 'evidence_backed'
    });
    expect(viewModel.rows.find((row) => row.agent_id === 'sales')).toMatchObject({
      evidence_refs: [],
      evidence_ref_count: 0,
      source_kinds: [],
      latest_evidence_at: null,
      confidence: null,
      status: 'uncovered_in_snapshot'
    });
    expect(JSON.stringify(viewModel)).not.toContain('checkpoint');
  });

  it('derives bounded HUD focus items from low-confidence and uncovered overview rows only', () => {
    const coverage = buildCoverage();
    const originalCoverage = JSON.parse(JSON.stringify(coverage));

    const focusItems = deriveCollectorEvidenceCoverageFocusItems(coverage, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'sales', display_name: 'Sales Agent' },
      { agent_id: 'support', display_name: 'Support Agent' }
    ]);

    expect(coverage).toEqual(originalCoverage);
    expect(focusItems).toEqual([
      {
        agent_id: 'growth-revenue',
        display_name: 'Growth Revenue Agent',
        evidence_ref_count: 2,
        source_kinds: ['tmux_observation', 'workspace_file'],
        latest_evidence_at: '2026-03-09T18:04:30.000Z',
        status: 'low_confidence_evidence',
        warning: 'low-confidence evidence coverage'
      },
      {
        agent_id: 'sales',
        display_name: 'Sales Agent',
        evidence_ref_count: 0,
        source_kinds: [],
        latest_evidence_at: null,
        status: 'uncovered_in_snapshot',
        warning: null
      },
      {
        agent_id: 'support',
        display_name: 'Support Agent',
        evidence_ref_count: 0,
        source_kinds: [],
        latest_evidence_at: null,
        status: 'uncovered_in_snapshot',
        warning: null
      }
    ]);
    expect(JSON.stringify(focusItems)).not.toContain('/tmp/');
  });

  it('reports total and overflow before capping visible focus items', () => {
    const coverage = buildCoverage();

    const summary = deriveCollectorEvidenceCoverageFocusSummary(coverage, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'market-intel', display_name: 'Market Intel Agent' },
      { agent_id: 'product-pmf', display_name: 'Product PMF Agent' },
      { agent_id: 'tokenomics', display_name: 'Tokenomics Agent' }
    ], 2);

    expect(summary.totalGapCount).toBe(4);
    expect(summary.visibleItems).toHaveLength(2);
    expect(summary.overflowCount).toBe(2);
    expect(summary.visibleItems.map((item) => item.display_name)).toEqual([
      'Growth Revenue Agent',
      'Market Intel Agent'
    ]);
    expect(summary.visibleItems[0].source_labels).toEqual(['Runtime evidence', 'Workspace evidence']);
    expect(JSON.stringify(summary)).not.toMatch(
      /\/tmp\/|tmux\.log|token|webhook|control-plane|session_ref|profile|tmux_observation|workspace_file|workspace_root|hermes_profile|hermes_session/i
    );

    const zeroCapSummary = deriveCollectorEvidenceCoverageFocusSummary(coverage, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' },
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' },
      { agent_id: 'market-intel', display_name: 'Market Intel Agent' },
      { agent_id: 'product-pmf', display_name: 'Product PMF Agent' },
      { agent_id: 'tokenomics', display_name: 'Tokenomics Agent' }
    ], 0);

    expect(zeroCapSummary.totalGapCount).toBe(4);
    expect(zeroCapSummary.visibleItems).toEqual([]);
    expect(zeroCapSummary.overflowCount).toBe(4);
  });

  it('does not show focus items for missing coverage, non-overview agents, or non-positive limits', () => {
    const coverage = buildCoverage();

    expect(deriveCollectorEvidenceCoverageFocusItems(null, [
      { agent_id: 'sales', display_name: 'Sales Agent' }
    ])).toEqual([]);
    expect(deriveCollectorEvidenceCoverageFocusItems(coverage, [
      { agent_id: 'app-engineering', display_name: 'App Engineering Agent' }
    ])).toEqual([]);
    expect(deriveCollectorEvidenceCoverageFocusItems(coverage, [
      { agent_id: 'growth-revenue', display_name: 'Growth Revenue Agent' }
    ], 0)).toEqual([]);
  });
});
