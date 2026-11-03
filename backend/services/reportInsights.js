'use strict';

const tierLabel = (tier) => ({
  on_device: 'On-device',
  far_edge: 'Far edge',
  regional_edge: 'Regional edge',
  cloud: 'Cloud'
})[tier] || String(tier || 'Unknown');
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const unwrap = (object) => (object && typeof object === 'object' && 'value' in object)
  ? object.value
  : object;

function buildReportInsights(data, closeThreshold = 2) {
  const winner = data?.recommended_tier;
  const scores = data?.scores || {};
  const eligible = data?.details?.feasibility || {};
  const ranked = Object.entries(scores)
    .filter(([tier, score]) => finite(score) && eligible[tier]?.eligible !== false)
    .sort((a, b) => b[1] - a[1]);
  const runner = ranked.find(([tier]) => tier !== winner);
  const winnerScore = scores[winner];
  const gap = runner && finite(winnerScore) ? +(winnerScore - runner[1]).toFixed(2) : null;
  const closeRanking = gap !== null && gap >= 0 && gap <= closeThreshold;
  const closeRankingText = closeRanking
    ? `${tierLabel(winner)} ranks just ${gap.toFixed(1)} suitability points ahead of ${tierLabel(runner[0])}. The difference is narrow and based on provisional model assumptions; validate with workload-specific evidence.`
    : null;
  const drivers = (data?.details?.decision_drivers || data?.details?.explainability?.decision_drivers || [])
    .filter((driver) => finite(driver.advantage_points) && driver.advantage_points > 0)
    .slice(0, 3)
    .map((driver) => `${String(driver.factor).replace(/_/g, ' ')} (+${driver.advantage_points.toFixed(2)} modeled points)`);
  const decisionFactorsText = drivers.length
    ? `Top modeled factors favoring ${tierLabel(winner)}: ${drivers.join('; ')}. These are scoring contributions, not independently verified causal evidence.`
    : 'A factor-level comparison was not supplied by the recommendation engine.';
  const evidenceGaps = Array.isArray(data?.details?.evidence_gaps?.[winner])
    ? data.details.evidence_gaps[winner].slice(0, 5)
    : [];

  const tierChecks = {};
  for (const tier of ['on_device', 'far_edge', 'regional_edge', 'cloud']) {
    const metric = data?.metrics_by_tier?.[tier] || {};
    const estimate = data?.details?.tier_estimates?.[tier] || {};
    const latencyValue = unwrap(metric.latency_ms);
    const costValue = unwrap(metric.monthly_cost_inr);
    const latency = finite(latencyValue) ? latencyValue : estimate.latency_ms;
    const cost = finite(costValue) ? costValue : estimate.monthly_cost_inr;
    const latencyTarget = data?.workload?.latency_requirement_ms;
    const budget = data?.workload?.budget_monthly;
    const latencySource = metric.latency_ms?.source || metric.field_sources?.latency_ms || estimate.latency_source;
    const costSource = metric.monthly_cost_inr?.source || metric.field_sources?.monthly_cost_inr || estimate.cost_source;
    const verifiedLatency = estimate.latency_target_verified === true && latencySource === 'measured';
    const verifiedCost = estimate.budget_verified === true && ['quoted', 'measured'].includes(costSource);
    tierChecks[tier] = {
      latency: finite(latency) && finite(latencyTarget)
        ? `${verifiedLatency ? 'Verified' : 'Estimated'} target ${latency <= latencyTarget ? 'met' : 'exceeded'}${verifiedLatency ? '' : ' — unverified'}`
        : 'Latency target: unknown',
      cost: finite(cost) && finite(budget)
        ? `${verifiedCost ? 'Verified' : 'Estimated'} budget ${cost <= budget ? 'met' : 'exceeded'}${verifiedCost ? '' : ' — unverified'}`
        : 'Budget status: unknown'
    };
  }
  return { winner, gap, closeRanking, closeRankingText, decisionFactorsText, evidenceGaps, tierChecks };
}

module.exports = { buildReportInsights };
