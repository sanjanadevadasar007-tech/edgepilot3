const { buildReportInsights } = require('../services/reportInsights');

describe('PDF decision transparency summary', () => {
  test('flags a narrow ranking and returns supplied reasons and evidence gaps', () => {
    const insights = buildReportInsights({
      recommended_tier: 'far_edge',
      scores: { far_edge: 72, on_device: 71.8, regional_edge: 70.9, cloud: 60.8 },
      workload: { latency_requirement_ms: 50, budget_monthly: 100000 },
      metrics_by_tier: {
        far_edge: {
          latency_ms: { value: 30, source: 'estimated' },
          monthly_cost_inr: { value: 500, source: 'estimated' },
        },
      },
      details: {
        decision_drivers: [{ factor: 'affordability', advantage_points: 1.1 }],
        evidence_gaps: { far_edge: ['Available network bandwidth not measured.'] },
        tier_estimates: { far_edge: { latency_target_verified: false, budget_verified: false } },
      },
    });

    expect(insights.closeRanking).toBe(true);
    expect(insights.closeRankingText).toContain('0.2 suitability points');
    expect(insights.decisionFactorsText).toContain('affordability');
    expect(insights.tierChecks.far_edge.latency).toBe('Estimated target met — unverified');
    expect(insights.tierChecks.far_edge.cost).toBe('Estimated budget met — unverified');
    expect(insights.evidenceGaps[0]).toContain('bandwidth');
  });

  test('does not invent values or verified outcomes when evidence is missing', () => {
    const insights = buildReportInsights({
      recommended_tier: 'cloud',
      scores: { cloud: 80 },
      workload: { latency_requirement_ms: 30, budget_monthly: 1000 },
    });

    expect(insights.closeRanking).toBe(false);
    expect(insights.tierChecks.cloud.latency).toBe('Latency target: unknown');
    expect(insights.tierChecks.cloud.cost).toBe('Budget status: unknown');
  });
});
