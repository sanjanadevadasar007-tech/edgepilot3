'use strict';

const PDFDocument = require('pdfkit');
const { buildReportInsights } = require('./reportInsights');

const TIERS = ['on_device', 'far_edge', 'regional_edge', 'cloud'];
const LABELS = {
  on_device: 'On-device', far_edge: 'Far edge',
  regional_edge: 'Regional edge', cloud: 'Cloud'
};
const DARK = '#0F172A';
const TEXT = '#334155';
const MUTED = '#64748B';
const BLUE = '#1E40AF';
const BORDER = '#CBD5E1';
const X = 35;
const W = 525;
const MAX_Y = 735;

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function valueOf(metric) {
  const value = metric && typeof metric === 'object' ? metric.value : metric;
  return finite(value) ? value : null;
}

function formatMetric(value) {
  return finite(value) ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : 'Not available';
}

function textOf(value, fallback = 'Not supplied') {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

function short(value, max = 160) {
  const text = textOf(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function tierName(tier) {
  return LABELS[tier] || 'No feasible tier';
}

function getMetric(data, tier, field) {
  const raw = data.metrics_by_tier?.[tier]?.[field];
  const estimate = data.details?.tier_estimates?.[tier];
  const value = valueOf(raw);
  const estimateValue = field === 'latency_ms' ? estimate?.latency_ms : estimate?.monthly_cost_inr;
  const source = (raw && typeof raw === 'object' ? raw.source : null)
    || (field === 'latency_ms' ? estimate?.latency_source : estimate?.cost_source)
    || null;

  return {
    value: value !== null ? value : (finite(estimateValue) ? estimateValue : null),
    source,
    raw: raw && typeof raw === 'object' ? raw : null
  };
}

function sourceLabel(source) {
  if (source === 'measured') return 'Measured';
  if (source === 'quoted') return 'Quoted';
  if (source === 'estimated' || source === 'demo') return 'Estimated / demo';
  return 'Unknown';
}

function metricCheck(metric, limit, kind, engineVerified) {
  if (!finite(metric.value) || !finite(limit)) return kind === 'latency' ? 'Target unknown' : 'Budget unknown';
  const verified = engineVerified === true
    && (kind === 'latency' ? metric.source === 'measured' : ['quoted', 'measured'].includes(metric.source));
  const status = metric.value <= limit ? 'met' : 'exceeded';
  return `${verified ? 'Verified' : 'Est.'} ${kind === 'latency' ? 'target' : 'budget'} ${status}${verified ? '' : ' (unverified)'}`;
}

function generatePdfReport(data, res) {
  if (!data || typeof data !== 'object') throw new TypeError('Recommendation result is required');

  const insights = buildReportInsights(data);
  const workload = data.workload || {};
  const winner = TIERS.includes(data.recommended_tier) ? data.recommended_tier : null;
  const details = data.details || {};
  const selectedLatency = winner ? getMetric(data, winner, 'latency_ms') : { value: null };
  const selectedCost = winner ? getMetric(data, winner, 'monthly_cost_inr') : { value: null };

  const doc = new PDFDocument({
    margin: { top: 35, bottom: 0, left: 35, right: 35 },
    size: 'A4',
    autoFirstPage: true
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="EdgePilot_Recommendation_Evidence_Report.pdf"');
  doc.pipe(res);

  let y = 74;
  let page = 1;
  function header(continuation = false) {
    doc.rect(0, 0, doc.page.width, 64).fill(DARK);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16)
      .text('EdgePilot AI - Deployment Evidence Report', X, 16, { width: W });
    doc.font('Helvetica').fontSize(8).fillColor('#CBD5E1')
      .text(`${continuation ? 'Continued' : 'Recommendation report'} | ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, X, 41, { width: W });
  }
  function footer() {
    const footerY = doc.page.height - 78;

    doc.rect(35, footerY - 8, doc.page.width - 70, 1)
      .fill('#CBD5E1');

    doc.font('Helvetica')
      .fontSize(8)
      .fillColor('#94A3B8')
      .text(
        'EdgePilot AI | Illustrative estimates are not deployment guarantees',
        35,
        footerY,
        {
          width: doc.page.width - 70,
          align: 'center',
          lineBreak: false
        }
      );
  }
  function ensureRoom(height) {
    if (y + height <= MAX_Y) return;
    footer();
    doc.addPage();
    page += 1;
    y = 78;
    header(true);
  }
  function title(label) {
    ensureRoom(31);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10.5).text(label, X, y, { width: W });
    y += 17;
    doc.rect(X, y, W, 1).fill(BORDER);
    y += 10;
  }
  function paragraph(content, options = {}) {
    if (content === undefined || content === null || content === '') return;
    const size = options.size ?? 8.2;
    const width = options.width ?? W - 15;
    const x = options.x ?? X + 7;
    const gap = options.gap ?? 6;
    const lineGap = 1.5;
    const text = String(content);
    doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    const height = Math.ceil(doc.heightOfString(text, { width, lineGap })) + 2;
    ensureRoom(height + gap);
    doc.fillColor(options.color || TEXT).text(text, x, y, { width, lineGap });
    y += height + gap;
  }

  header();

  ensureRoom(97);
  doc.rect(X, y, W, 97).fillAndStroke('#F8FAFC', BORDER);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(9)
    .text('WORKLOAD SPECIFICATIONS', X + 10, y + 8);
  doc.font('Helvetica').fontSize(8).fillColor(TEXT);
  const row1 = [
    `Latency: ${finite(workload.latency_requirement_ms) ? `${formatMetric(workload.latency_requirement_ms)} ms` : 'Not provided'}`,
    `Budget: ${finite(workload.budget_monthly) ? `INR ${formatMetric(workload.budget_monthly)}/mo` : 'Not provided'}`,
    `Privacy: ${textOf(workload.privacy_requirement)}`
  ];
  const row2 = [
    `Criticality: ${textOf(workload.criticality)}`,
    `Bandwidth demand: ${textOf(workload.bandwidth_requirement)}`,
    `Model: ${short(workload.model_name, 30)}`
  ];
  const row3 = [
    `Application type: ${short(workload.application_type, 30)}`,
    `Device: ${short(workload.target_device, 30)}`,
    `Runtime: ${short(workload.runtime, 30)}`
  ];
  row1.forEach((text, index) => doc.text(text, X + 10 + index * 172, y + 27, { width: 166 }));
  row2.forEach((text, index) => doc.text(text, X + 10 + index * 172, y + 47, { width: 166 }));
  row3.forEach((text, index) => doc.text(text, X + 10 + index * 172, y + 67, { width: 166 }));
  y += 105;

  ensureRoom(52);
  doc.rect(X, y, W, 42).fill(BLUE);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
    .text('RECOMMENDED DEPLOYMENT TIER', X + 10, y + 8);
  doc.fontSize(14).text(winner ? tierName(winner).toUpperCase() : 'NO FEASIBLE TIER', X + 10, y + 20);
  y += 51;

  title('1. Recommendation and evidence summary');
  paragraph(`- Selected-tier end-to-end latency: ${formatMetric(selectedLatency.value)}${selectedLatency.value === null ? '' : ' ms'} (${sourceLabel(selectedLatency.source)})`, { gap: 2 });
  paragraph(`- Selected-tier monthly cost: ${selectedCost.value === null ? 'Not available' : `INR ${formatMetric(selectedCost.value)}`} (${sourceLabel(selectedCost.source)})`, { gap: 3 });
  const scoreSummary = TIERS.map((tier) => `${tierName(tier)}: ${finite(data.scores?.[tier]) ? data.scores[tier].toFixed(1) : 'N/A'}`).join(' | ');
  paragraph(`Suitability / 100: ${scoreSummary}`, { size: 7.6, gap: 3 });
  paragraph('Scores are provisional suitability indices, not probabilities or verified deployment guarantees.', { size: 7.4, color: MUTED, gap: 9 });

  title('2. Four-tier comparison and provisional checks');
  const cols = [42, 121, 199, 291, 411];
  ensureRoom(20 + 4 * 49);
  const rowTop = y;
  doc.rect(X, rowTop, W, 20).fill('#E2E8F0');
  const heads = [
    ['TIER', cols[0], 76], ['LATENCY', cols[1], 72],
    ['COST / MONTH', cols[2], 88], ['EVIDENCE', cols[3], 113],
    ['SLA / BUDGET CHECK', cols[4], 144]
  ];
  heads.forEach(([text, x, width]) => {
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7).text(text, x, rowTop + 6, { width });
  });
  y += 20;

  TIERS.forEach((tier, index) => {
    const latency = getMetric(data, tier, 'latency_ms');
    const cost = getMetric(data, tier, 'monthly_cost_inr');
    const estimate = details.tier_estimates?.[tier] || {};
    const isWinner = tier === winner;
    const rowY = y;
    doc.rect(X, rowY, W, 49).fill(isWinner ? '#DBEAFE' : index % 2 ? '#F8FAFC' : '#FFFFFF');
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7.7)
      .text(tierName(tier), cols[0], rowY + 10, { width: 76 });
    doc.font('Helvetica').fillColor(TEXT).fontSize(7.5)
      .text(latency.value === null ? 'Unknown' : `${formatMetric(latency.value)} ms`, cols[1], rowY + 10, { width: 72 })
      .text(cost.value === null ? 'Unknown' : `INR ${formatMetric(cost.value)}`, cols[2], rowY + 10, { width: 88 });
    doc.fontSize(7)
      .text(`Lat: ${sourceLabel(latency.source)}\nCost: ${sourceLabel(cost.source)}`, cols[3], rowY + 7, { width: 112, lineGap: 2 });
    const latencyCheck = metricCheck(latency, workload.latency_requirement_ms, 'latency', estimate.latency_target_verified);
    const costCheck = metricCheck(cost, workload.budget_monthly, 'budget', estimate.budget_verified);
    doc.fontSize(7).text(`${latencyCheck}\n${costCheck}`, cols[4], rowY + 5, { width: 142, lineGap: 1 });
    y += 49;
  });
  y += 10;

  title('3. Selected-tier cost and latency breakdown');
  if (!winner) {
    paragraph('No tier was selected under the current confirmed constraints. Review exclusion reasons and missing evidence.');
  } else {
    const rawLatency = selectedLatency.raw;
    const rawCost = selectedCost.raw;
    const latencyParts = rawLatency?.latency_components_ms;
    const costParts = rawCost?.cost_components_inr;
    paragraph(`Latency components: ${latencyParts && Object.keys(latencyParts).length ? Object.entries(latencyParts).map(([key, value]) => `${key.replace(/_/g, ' ')} ${formatMetric(value)} ms`).join(' | ') : 'Not supplied'}`, { size: 7.7, gap: 3 });
    paragraph(`Cost components: ${costParts && Object.keys(costParts).length ? Object.entries(costParts).map(([key, value]) => `${key.replace(/_/g, ' ')} INR ${formatMetric(value)}`).join(' | ') : 'Not supplied'}`, { size: 7.7, gap: 4 });
    if (rawLatency?.source_reference || rawCost?.source_reference) {
      paragraph(`Source notes: latency - ${short(rawLatency?.source_reference, 85)}; cost - ${short(rawCost?.source_reference, 85)}`, { size: 7.2, color: MUTED, gap: 5 });
    }
  }

  title('4. Decision rationale and close-ranking check');
  paragraph(short(data.explanation || 'No deterministic rationale supplied by the engine.', 420), { size: 8, gap: 4 });
  if (insights.closeRankingText) {
    paragraph(`CLOSE RANKING: ${insights.closeRankingText}`, { bold: true, size: 8, color: '#92400E', gap: 4 });
  }
  if (insights.decisionFactorsText) paragraph(insights.decisionFactorsText, { size: 7.8, gap: 6 });

  title('5. Evidence gaps and validation required');
  const gaps = Array.isArray(insights.evidenceGaps) ? insights.evidenceGaps : [];
  if (gaps.length) {
    gaps.slice(0, 5).forEach((gap, index) => paragraph(`${index + 1}. ${short(gap, 200)}`, { size: 7.9, gap: 2 }));
  } else {
    paragraph('No additional selected-tier evidence gaps supplied; this does not constitute verified SLA compliance.', { size: 7.8, gap: 4 });
  }
  paragraph('Demo/estimated figures need workload-matched end-to-end measurements and provider pricing before production decisions.', { color: MUTED, size: 7.7, gap: 6 });

  footer();
  doc.end();
}

module.exports = { generatePdfReport };
