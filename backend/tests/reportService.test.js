jest.mock('pdfkit', () => class MockPDFDocument {
  constructor() {
    this.page = { width: 595, height: 842 };
    this.textValues = [];
    global.reportDocument = this;
  }
  pipe() { return this; }
  rect() { return this; }
  fill() { return this; }
  fillAndStroke() { return this; }
  fillColor() { return this; }
  fontSize() { return this; }
  font() { return this; }
  text(value) { this.textValues.push(String(value)); return this; }
  heightOfString(value, { width } = {}) {
    return 11 * Math.max(1, Math.ceil(String(value).length / Math.max(20, Math.floor((width || 500) / 5))));
  }
  addPage() { return this; }
  end() { return this; }
});

const { generatePdfReport } = require('../services/reportService');
const response = () => ({ setHeader: jest.fn() });
const textContains = (phrase) => global.reportDocument.textValues.some((value) => value.includes(phrase));

describe('Evidence-aware PDF report', () => {
  afterEach(() => {
    delete global.reportDocument;
  });

  test('unknown metrics never become zero or invented measurements', () => {
    const res = response();
    generatePdfReport({ recommended_tier: 'on_device', metrics_by_tier: {} }, res);

    expect(textContains('Selected-tier end-to-end latency: Not available')).toBe(true);
    expect(textContains('Selected-tier monthly cost: Not available')).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="EdgePilot_Recommendation_Evidence_Report.pdf"',
    );
  });

  test('preserves a genuine zero monthly cost', () => {
    generatePdfReport({
      recommended_tier: 'on_device',
      metrics_by_tier: {
        on_device: {
          latency_ms: { value: 15, source: 'estimated' },
          monthly_cost_inr: { value: 0, source: 'estimated' },
        },
      },
    }, response());

    expect(textContains('Selected-tier monthly cost: INR 0')).toBe(true);
  });

  test('does not silently choose a tier when no winner is supplied', () => {
    generatePdfReport({ recommended_tier: null, scores: {}, metrics_by_tier: {} }, response());
    expect(textContains('NO FEASIBLE TIER')).toBe(true);
    expect(textContains('No tier was selected under the current confirmed constraints.')).toBe(true);
  });

  test('includes workload, rationale, and close-ranking evidence in the report', () => {
    generatePdfReport({
      recommended_tier: 'far_edge',
      workload: {
        latency_requirement_ms: 50,
        budget_monthly: 100000,
        privacy_requirement: 'high',
        criticality: 'high',
        bandwidth_requirement: 'high',
        application_type: 'smart_camera',
        model_name: 'mobilenet_v2',
      },
      scores: { on_device: 71.8, far_edge: 72, regional_edge: 70.9, cloud: 60.8 },
      explanation: 'Far edge ranks narrowly ahead of on-device.',
      metrics_by_tier: {
        far_edge: {
          latency_ms: { value: 30, source: 'estimated', source_reference: 'DEMO NETWORK MODEL' },
          monthly_cost_inr: { value: 500, source: 'estimated', source_reference: 'DEMO COST' },
        },
      },
      details: {
        decision_drivers: [{ factor: 'scalability', advantage_points: 1.4 }],
        evidence_gaps: { far_edge: ['End-to-end latency deadline not verified by measurement.'] },
      },
    }, response());

    expect(textContains('Latency: 50 ms')).toBe(true);
    expect(textContains('Budget: INR 1,00,000/mo')).toBe(true);
    expect(textContains('Application type: smart_camera')).toBe(true);
    expect(textContains('Model: mobilenet_v2')).toBe(true);
    expect(textContains('CLOSE RANKING:')).toBe(true);
    expect(textContains('0.2 suitability points')).toBe(true);
    expect(textContains('Top modeled factors')).toBe(true);
    expect(textContains('End-to-end latency deadline not verified')).toBe(true);
    expect(textContains('Est. target met (unverified)')).toBe(true);
  });
});
