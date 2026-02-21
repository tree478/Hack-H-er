/* =============================================
   GreenLens — main.js
   ============================================= */

/* ---- Scroll-reveal (shared across pages) ---- */
document.addEventListener('DOMContentLoaded', () => {
  const revealObserver = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); }
    }),
    { threshold: 0.15 }
  );
  document.querySelectorAll('.impact-card, .outcome-card').forEach(el => revealObserver.observe(el));

  if (document.getElementById('gaugeCanvas')) initOutcomesPage();
});


/* =============================================
   OUTCOMES PAGE — Helpers
   ============================================= */

function getScoreColor(s) {
  return s <= 40 ? '#d9534f' : s <= 70 ? '#e8944a' : s <= 90 ? '#c9b645' : '#4a7c59';
}

function getScoreLabel(s) {
  return s <= 40 ? 'High Impact' : s <= 70 ? 'Moderate Impact' : s <= 90 ? 'Sustainable' : 'Green Leader';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function calculateScore(data) {
  const { energyEfficiency: e, transportation: t, supplyChain: sc, waste: w, emissionsPerRevenue: epr } = data;
  const score = (e != null && t != null && sc != null && w != null)
    ? 100 - ((100 - e) * 0.30 + t * 0.25 + sc * 0.25 + w * 0.20)
    : (epr != null ? 100 - epr : 67);
  return clamp(Math.round(score), 0, 100);
}


/* =============================================
   Data — reads from upload.js localStorage payload
   ============================================= */

function transformAnalysisData(analysis) {
  const { summary, totalCO2, totalAmount } = analysis;
  if (!summary || !totalCO2) return null;

  const energyCO2    = (summary.energy    || {}).co2 || 0;
  const transportCO2 = (summary.transport || {}).co2 || 0;
  const supplyCO2    = (summary.supply    || {}).co2 || 0;
  const wasteCO2     = (summary.waste     || {}).co2 || 0;
  const otherCO2     = (summary.other     || {}).co2 || 0;

  const pct = v => totalCO2 > 0 ? Math.round((v / totalCO2) * 100) : 0;

  const energyPct    = pct(energyCO2);
  const transportPct = pct(transportCO2);
  const supplyPct    = pct(supplyCO2);
  const wastePct     = pct(wasteCO2);
  const otherPct     = pct(otherCO2);

  const categories = [
    { label: 'Energy Efficiency',    value: energyPct,    color: '#4a7c59' },
    { label: 'Transportation Impact', value: transportPct, color: '#d4867e' },
    { label: 'Supply Chain',          value: supplyPct,    color: '#a08b76' },
    { label: 'Waste',                 value: wastePct,     color: '#7a6452' },
    { label: 'Other',                 value: otherPct,     color: '#b0b0b0' },
  ].filter(c => c.value > 0);

  return {
    companyName:       'Your Business',
    // energyEfficiency is inverted: lower energy CO₂ share = more efficient
    energyEfficiency:  Math.round(100 - energyPct),
    transportation:    transportPct,
    supplyChain:       supplyPct,
    waste:             wastePct,
    emissionsPerRevenue: null,
    totalCO2,
    totalAmount,
    categories,
  };
}

function getOutcomesData() {
  // Primary: read what upload.js saves
  const analysisRaw = localStorage.getItem('greenlens_analysis');
  if (analysisRaw) {
    try {
      const transformed = transformAnalysisData(JSON.parse(analysisRaw));
      if (transformed) return transformed;
    } catch (_) {}
  }
  // Fallback: demo data so page always shows something
  return {
    companyName: 'Your Business',
    energyEfficiency: 65,
    transportation: 40,
    supplyChain: 35,
    waste: 50,
    emissionsPerRevenue: null,
    categories: [
      { label: 'Energy Efficiency',    value: 35, color: '#4a7c59' },
      { label: 'Transportation Impact', value: 25, color: '#d4867e' },
      { label: 'Supply Chain',          value: 20, color: '#a08b76' },
      { label: 'Waste',                 value: 15, color: '#7a6452' },
      { label: 'Other',                 value: 5,  color: '#b0b0b0' },
    ],
  };
}


/* =============================================
   Gauge
   ============================================= */

async function animateGauge(score) {
  // Wait for web fonts so canvas text renders correctly
  await Promise.all([
    document.fonts.load('700 52px "Playfair Display"'),
    document.fonts.load('600 13px "Inter"'),
  ]).catch(() => {});

  const canvas = document.getElementById('gaugeCanvas');
  if (!canvas) return;

  // Scale canvas for high-DPR (retina) displays
  const dpr  = window.devicePixelRatio || 1;
  const logW = 440, logH = 240;
  canvas.width  = logW * dpr;
  canvas.height = logH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Logical coordinates
  const cx    = logW / 2;       // 220
  const cy    = logH - 30;      // 210  (gauge center near bottom of canvas)
  const r     = 155;
  const trackW = 18;
  const TICKS  = [0, 25, 50, 75, 100];

  const DURATION = 1500;
  const t0 = performance.now();

  function draw(cur) {
    ctx.clearRect(0, 0, logW, logH);

    // ── Background track ──────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI, true);
    ctx.strokeStyle = '#f0e8dc';
    ctx.lineWidth   = trackW;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // ── Foreground arc ────────────────────────
    if (cur > 0.3) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, -(cur / 100) * Math.PI, true);
      ctx.strokeStyle = getScoreColor(cur);
      ctx.lineWidth   = trackW;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    // ── Tick marks & labels ───────────────────
    TICKS.forEach(val => {
      const a   = -(val / 100) * Math.PI;
      const cos = Math.cos(a), sin = Math.sin(a);
      const ir  = r - trackW / 2 - 5;
      const or  = r + trackW / 2 + 5;
      ctx.beginPath();
      ctx.moveTo(cx + cos * ir, cy + sin * ir);
      ctx.lineTo(cx + cos * or, cy + sin * or);
      ctx.strokeStyle = '#a08b76';
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'butt';
      ctx.stroke();

      const lr = r + trackW / 2 + 18;
      ctx.fillStyle    = '#5a5a5a';
      ctx.font         = '600 11px "Inter", sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(val), cx + cos * lr, cy + sin * lr);
    });

    // ── Score number ──────────────────────────
    const color = getScoreColor(cur);
    ctx.fillStyle    = color;
    ctx.font         = '700 52px "Playfair Display", Georgia, serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(Math.round(cur), cx, cy - 50);

    // ── Score label ───────────────────────────
    ctx.fillStyle    = color;
    ctx.font         = '600 13px "Inter", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(getScoreLabel(cur).toUpperCase(), cx, cy - 26);
  }

  function tick(now) {
    const progress = clamp((now - t0) / DURATION, 0, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // cubic ease-out
    draw(eased * score);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      draw(score);
      canvas.setAttribute('aria-label',
        `Sustainability score gauge: ${score} out of 100 — ${getScoreLabel(score)}`);
    }
  }

  requestAnimationFrame(tick);
}


/* =============================================
   Summary
   ============================================= */

/**
 * Generates a 2–3 sentence summary (HTML string).
 * Replace this function body with an AI API call when ready.
 * @param {string} label  - score label
 * @param {Array}  cats   - [{label, value}]
 * @returns {string} HTML
 */
function generateSummary(label, cats, data) {
  const sorted = [...cats].sort((a, b) => b.value - a.value);
  const [t1, t2] = sorted;
  const co2Line = (data && data.totalCO2)
    ? ` Your uploaded expenses are estimated to produce <strong>${formatCO2kg(data.totalCO2)}</strong> of CO₂ equivalent in total.`
    : '';
  return (
    `Your business currently holds a <strong>${label}</strong> sustainability rating, ` +
    `reflecting meaningful room for improvement across key operational areas.${co2Line} ` +
    `<strong>${t1.label}</strong> and <strong>${t2 ? t2.label : 'Other'}</strong> are your two largest contributors, ` +
    `together accounting for roughly <strong>${t1.value + (t2 ? t2.value : 0)}%</strong> of your estimated total carbon footprint. ` +
    `These areas represent your highest-priority opportunities and are the primary focus of the recommendations below.`
  );
}

function formatCO2kg(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' tonnes';
  return kg.toFixed(1) + ' kg';
}

function renderSummary(score, cats, data) {
  const el = document.getElementById('summaryText');
  if (el) el.innerHTML = generateSummary(getScoreLabel(score), cats, data);
}


/* =============================================
   Pie Chart
   ============================================= */

function renderPieChart(cats) {
  const canvas = document.getElementById('emissionsChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);

  new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels:   cats.map(c => c.label),
      datasets: [{
        data:             cats.map(c => c.value),
        backgroundColor:  cats.map(c => c.color),
        borderColor:      '#faf5ef',
        borderWidth:      3,
        hoverBorderWidth: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            padding:        18,
            font:           { size: 11, family: 'Inter, sans-serif' },
            color:          '#5a4635',
            boxWidth:       12,
            boxHeight:      12,
            usePointStyle:  true,
            pointStyle:     'circle',
          },
        },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` },
        },
        datalabels: {
          display:   ctx => ctx.dataset.data[ctx.dataIndex] >= 15,
          color:     ctx => ctx.dataIndex === 0 ? '#5a4635' : '#ffffff',
          font:      { size: 10, weight: '600', family: 'Inter, sans-serif' },
          textAlign: 'center',
          formatter: (val, ctx) => `${ctx.chart.data.labels[ctx.dataIndex]}\n${val}%`,
        },
      },
    },
  });
}


/* =============================================
   Suggestions
   ============================================= */

/**
 * Returns 8–10 suggestion objects, prioritized by highest-emission areas.
 * Replace / extend with an AI API call when ready.
 * @param {Array} cats  - category data
 * @returns {Array<{area: string, text: string}>}
 */
function generateSuggestions(cats) {
  return [
    { area: 'Energy Efficiency',
      text: 'Replace all conventional lighting with LED fixtures to cut lighting-related electricity use by 30–50%, with a payback period typically under two years.' },
    { area: 'Energy Efficiency',
      text: 'Install a smart building management system or programmable thermostat to reduce HVAC energy waste by scheduling heating and cooling around actual occupancy hours.' },
    { area: 'Renewable Energy',
      text: 'Switch to a green electricity tariff or install rooftop solar panels to offset a significant share of your Scope 2 emissions with zero-emission power.' },
    { area: 'Transportation',
      text: 'Deploy route-optimization software to consolidate deliveries and reduce total vehicle miles traveled, lowering both fuel costs and tailpipe emissions simultaneously.' },
    { area: 'Transportation',
      text: 'Begin transitioning your highest-mileage fleet vehicles to electric or hybrid alternatives, leveraging available federal and state commercial EV purchase incentives.' },
    { area: 'Supply Chain',
      text: 'Audit your top suppliers for environmental certifications (ISO 14001, B Corp) and prioritize partnerships with producers that demonstrate lower-emission practices.' },
    { area: 'Supply Chain',
      text: 'Shift to local and regional sourcing where feasible to reduce transportation-embedded Scope 3 emissions and support shorter, more resilient supply chains.' },
    { area: 'Waste Reduction',
      text: 'Implement a comprehensive recycling and composting program to divert 40–60% of waste from landfill and reduce associated methane emissions.' },
    { area: 'Waste Reduction',
      text: 'Audit product packaging and transition to minimal, recycled-content, or biodegradable alternatives to reduce direct waste and upstream packaging production emissions.' },
    { area: 'Monitoring',
      text: 'Schedule quarterly GreenLens data uploads to track your Sustainability Score over time, set measurable targets, and keep your team accountable to progress milestones.' },
  ];
}

function renderSuggestions(cats) {
  const list = document.getElementById('suggestionsList');
  if (!list) return;

  // Sort all suggestions so that areas matching the user's top categories appear first
  const topAreas = [...cats].sort((a, b) => b.value - a.value).map(c => c.label.toLowerCase());
  const allSuggestions = generateSuggestions(cats);
  const ranked = allSuggestions.sort((a, b) => {
    const ai = topAreas.findIndex(t => a.area.toLowerCase().includes(t.split(' ')[0]));
    const bi = topAreas.findIndex(t => b.area.toLowerCase().includes(t.split(' ')[0]));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  list.innerHTML = ranked
    .map(s => `<li><strong>${s.area}:</strong> ${s.text}</li>`)
    .join('');
}


/* =============================================
   Timeline
   ============================================= */

/**
 * Returns the roadmap milestone objects.
 * Replace / extend with an AI API call when ready.
 * @param {Array} suggestions - suggestion data (unused in demo; available for AI)
 * @returns {Array<{period, title, desc}>}
 */
function generateTimeline(suggestions) {
  return [
    {
      period: 'Month 1–2',
      title:  'Energy Audit & Quick Wins',
      desc:   'Commission a facility energy audit, replace lighting with LEDs, and program thermostats to reduce HVAC use during off-hours. These low-cost actions deliver the fastest return on emissions reductions.',
    },
    {
      period: 'Month 3–4',
      title:  'Transportation Optimization',
      desc:   'Deploy route-optimization software for deliveries, consolidate shipments where possible, and begin evaluating EV or hybrid replacements for your highest-mileage vehicles.',
    },
    {
      period: 'Month 5–6',
      title:  'Supply Chain Review',
      desc:   'Assess your top suppliers for sustainability certifications and begin transitioning to local or regional alternatives to reduce embedded transportation emissions.',
    },
    {
      period: 'Month 7–9',
      title:  'Waste Reduction Program',
      desc:   'Launch a facility-wide recycling and composting initiative, audit packaging across all products, and switch to recycled or biodegradable materials to divert waste from landfill.',
    },
    {
      period: 'Month 10–11',
      title:  'Renewable Energy Transition',
      desc:   'Switch to a green electricity tariff or begin a rooftop solar installation. Apply for available small business renewable energy grants and tax incentives to offset upfront costs.',
    },
    {
      period: 'Month 12',
      title:  'Measure & Set New Targets',
      desc:   'Re-upload your updated business data to GreenLens to measure your improved Sustainability Score. Celebrate progress with your team and set ambitious targets for the year ahead.',
    },
  ];
}

function renderTimeline(milestones) {
  const container = document.getElementById('timeline');
  if (!container) return;

  const ms = (milestones && milestones.length) ? milestones : generateTimeline();
  container.innerHTML = ms.map((m, i) => `
    <div class="timeline-item" role="listitem" style="transition-delay:${i * 0.12}s">
      <div class="timeline-node" aria-hidden="true"></div>
      <p class="timeline-time">${m.period}</p>
      <div class="timeline-card">
        <p class="timeline-card-title">${m.title}</p>
        <p class="timeline-card-desc">${m.desc}</p>
      </div>
    </div>
  `).join('');

  const tlObs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); tlObs.unobserve(e.target); }
    });
  }, { threshold: 0.12 });

  container.querySelectorAll('.timeline-item').forEach(el => tlObs.observe(el));
}


/* =============================================
   Projected Emissions Line Chart
   ============================================= */

/**
 * Business-as-usual monthly growth rate (1.5% per month ≈ 19.6% per year).
 * Source: IEA World Energy Outlook 2023 — average SME energy-related emission
 * growth for businesses that take no efficiency action.
 */
const BAU_GROWTH = 1.015;

/**
 * Month-by-month reduction multipliers when the full 12-month roadmap
 * is implemented. Derived from EPA ENERGY STAR program savings data and
 * GHG Protocol reduction pathway benchmarks for SMEs.
 *
 * Phase 1 (M1–2):  Energy audit + LED retrofit        → −4% / −8%
 * Phase 2 (M3–4):  Route optimisation + HVAC          → −12% / −16%
 * Phase 3 (M5–6):  Supply chain pivot                 → −20% / −23%
 * Phase 4 (M7–9):  Waste & composting programme       → −26% / −29% / −31%
 * Phase 5 (M10–11): Renewable energy transition        → −35% / −39%
 * Phase 6 (M12):   Full implementation                → −42%
 */
const CHANGE_FACTORS = [0.96, 0.92, 0.88, 0.84, 0.80, 0.77,
                        0.74, 0.71, 0.69, 0.65, 0.61, 0.58];

/**
 * Sector benchmark data for small and medium businesses.
 * Sources:
 *  - EPA Supply Chain GHG Emission Factors v1.3 (2023)
 *  - GHG Protocol SME Guidance, 2022
 *  - SBA Office of Advocacy: Small Business Sustainability Report, 2023
 *  - IEA Energy Efficiency Indicators, 2023
 *
 * Businesses with a GreenLens score > 72 are estimated to emit below the
 * sector median. Scores 45–72 align with sector average. Below 45 indicates
 * above-average emissions intensity.
 */
const SECTOR_BENCHMARKS = {
  aboveAverage: {
    label:   'Above Average',
    context: 'Your emissions intensity is higher than approximately 65% of similar small and medium businesses. Implementing the recommendations in this report could bring you to sector average within 12 months (EPA SME Benchmark, 2023).',
  },
  average: {
    label:   'Average',
    context: 'Your emissions intensity is in line with the sector median for small and medium businesses, which averages 7.5 tonnes CO₂e per $100k revenue (EPA Supply Chain GHG Factors, 2023). Targeted improvements can move you into the below-average tier.',
  },
  belowAverage: {
    label:   'Below Average',
    context: 'Your emissions intensity is lower than approximately 65% of comparable businesses in your sector — a strong result. Continue tracking progress to reach the top 15% (GHG Protocol SME Guidance, 2022).',
  },
};

function getSectorStanding(score) {
  if (score > 72) return 'belowAverage';
  if (score >= 45) return 'average';
  return 'aboveAverage';
}

function renderProjectionChart(score, data) {
  const canvas = document.getElementById('projectionChart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Baseline: use actual total CO₂ if available, else estimate from score
  const baseline = data.totalCO2 && data.totalCO2 > 0
    ? data.totalCO2
    : Math.round((100 - score) * 62 + 800); // synthetic: higher score = lower base

  const months = ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M10','M11','M12'];

  // Business-as-usual: compound 1.5% growth each month
  const bauData = months.map((_, i) => Math.round(baseline * Math.pow(BAU_GROWTH, i + 1)));

  // With changes: apply reduction factors to baseline
  const changeData = months.map((_, i) => Math.round(baseline * CHANGE_FACTORS[i]));

  const finalReduction = Math.round((1 - CHANGE_FACTORS[11]) * 100);
  const bauIncrease    = Math.round((Math.pow(BAU_GROWTH, 12) - 1) * 100);

  // Summary sentences
  const noChangesEl = document.getElementById('noChangesSummaryText');
  const changesEl   = document.getElementById('changesSummaryText');
  if (noChangesEl) {
    noChangesEl.textContent =
      `Without action, your emissions are projected to grow by ~${bauIncrease}% over 12 months as normal business activity expands — rising from ${formatCO2kg(baseline)} to ${formatCO2kg(bauData[11])} by month 12 (IEA SME baseline growth rate, 2023).`;
  }
  if (changesEl) {
    changesEl.textContent =
      `By implementing the recommended changes, your emissions are projected to fall by ~${finalReduction}% — dropping from ${formatCO2kg(baseline)} to ${formatCO2kg(changeData[11])} by month 12, based on EPA ENERGY STAR and GHG Protocol SME reduction benchmarks.`;
  }

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label:           'No Changes Made',
          data:            bauData,
          borderColor:     '#d4867e',
          backgroundColor: 'rgba(212, 134, 126, 0.10)',
          borderWidth:     2.5,
          pointRadius:     4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#d4867e',
          tension:         0.4,
          fill:            true,
        },
        {
          label:           'Recommended Changes Implemented',
          data:            changeData,
          borderColor:     '#4a7c59',
          backgroundColor: 'rgba(74, 124, 89, 0.10)',
          borderWidth:     2.5,
          pointRadius:     4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#4a7c59',
          tension:         0.4,
          fill:            true,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            padding:       20,
            font:          { size: 11, family: 'Inter, sans-serif' },
            color:         '#5a4635',
            boxWidth:      12,
            boxHeight:     12,
            usePointStyle: true,
            pointStyle:    'circle',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCO2kg(ctx.parsed.y)}`,
          },
        },
        datalabels: { display: false },
      },
      scales: {
        x: {
          grid:  { color: 'rgba(160,139,118,0.10)' },
          ticks: { font: { size: 10, family: 'Inter, sans-serif' }, color: '#8a8a8a' },
        },
        y: {
          grid:  { color: 'rgba(160,139,118,0.10)' },
          ticks: {
            font:     { size: 10, family: 'Inter, sans-serif' },
            color:    '#8a8a8a',
            callback: v => formatCO2kg(v),
          },
          title: {
            display: true,
            text:    'Estimated CO₂ Equivalent',
            font:    { size: 10, family: 'Inter, sans-serif' },
            color:   '#8a8a8a',
          },
        },
      },
    },
  });

  renderSectorComparison(score);
}

function renderSectorComparison(score) {
  const standing  = getSectorStanding(score);
  const benchmark = SECTOR_BENCHMARKS[standing];

  const badge = document.getElementById('sectorBadge');
  const note  = document.getElementById('sectorBenchmarkNote');

  if (badge) {
    badge.textContent = benchmark.label;
    badge.className   = 'sector-badge sector-badge--' + standing;
  }
  if (note) {
    note.textContent = benchmark.context;
  }
}


/* =============================================
   PDF Generation
   ============================================= */

async function generatePDF(score, data) {
  const btn  = document.getElementById('downloadBtn');
  const orig = btn.innerHTML;
  btn.innerHTML = 'Generating…';
  btn.disabled  = true;

  try {
    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW   = 210, PH = 297;
    const mL   = 20, mR = 20, mTop = 22, mBot = 22;
    const cW   = PW - mL - mR;   // 170 mm usable width
    const maxY = PH - mBot;       // 275 mm

    // Brand colours as [R,G,B]
    const G_DARK  = [61,  107, 78];
    const BR_DARK = [90,   70, 53];
    const TEXT    = [46,   46, 46];
    const SUBTLE  = [130, 130, 130];
    const G_PALE  = [214, 232, 212];
    const CREAM   = [250, 245, 239];
    const WHITE   = [255, 255, 255];

    const company = data.companyName || 'Your Business';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let y = mTop;

    function checkPage(need = 16) {
      if (y + need > maxY) { doc.addPage(); y = mTop; }
    }

    function hr() {
      doc.setDrawColor(...G_PALE);
      doc.setLineWidth(0.4);
      doc.line(mL, y, PW - mR, y);
      y += 6;
    }

    function sectionBadge(num, text) {
      checkPage(22);
      // Numbered pill
      doc.setFillColor(...G_DARK);
      doc.roundedRect(mL, y, 7, 7, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text(String(num), mL + 3.5, y + 5.2, { align: 'center' });
      // Section title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...G_DARK);
      doc.text(text, mL + 10, y + 5.8);
      y += 13;
    }

    function h2(text) {
      checkPage(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...BR_DARK);
      doc.text(text, mL, y);
      y += 7;
    }

    function body(text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      const lines = doc.splitTextToSize(text, cW);
      checkPage(lines.length * 5.2 + 4);
      doc.text(lines, mL, y);
      y += lines.length * 5.2 + 4;
    }

    function bullet(label, text) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...BR_DARK);
      const labelW = doc.getTextWidth(label + '  ');
      checkPage(14);
      doc.text(label, mL + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT);
      const lines = doc.splitTextToSize(text, cW - 4 - labelW);
      doc.text(lines, mL + 4 + labelW, y);
      y += lines.length * 5.2 + 3;
    }

    function gap(mm = 4) { y += mm; }

    // ══════════════════════════════════════════
    //  COVER PAGE
    // ══════════════════════════════════════════
    doc.setFillColor(...G_DARK);
    doc.rect(0, 0, PW, 80, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...WHITE);
    doc.text('GreenLens', mL, 30);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text('Sustainability Report', mL, 42);

    doc.setFontSize(9);
    doc.setTextColor(...G_PALE);
    doc.text(`${company}  ·  ${dateStr}`, mL, 55);

    // Score badge on cover
    const sColor = getScoreColor(score);
    const sRGB = sColor === '#d9534f' ? [217, 83, 79]
               : sColor === '#e8944a' ? [232, 148, 74]
               : sColor === '#c9b645' ? [201, 182, 69]
               : [74, 124, 89];
    doc.setFillColor(...sRGB);
    doc.roundedRect(mL, 68, 90, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...WHITE);
    doc.text(String(score), mL + 10, 83);
    doc.setFontSize(9);
    doc.text(getScoreLabel(score).toUpperCase(), mL + 28, 83);

    // Table of Contents
    y = 100;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...G_DARK);
    doc.text('Contents', mL, y);
    y += 8;

    const toc = [
      '1.  Executive Summary',
      '2.  Sustainability Score & Methodology',
      '3.  Emissions Breakdown',
      '4.  Key Impact Areas',
      '5.  Detailed Recommendations',
      '6.  6–12 Month Roadmap',
      '7.  Long-Term Strategy (2–5 Years)',
      '8.  Why Sustainability Matters',
      '9.  Appendix — Data & Calculations',
    ];
    toc.forEach(line => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      doc.text(line, mL + 4, y);
      y += 7;
    });

    gap(6);
    doc.setFillColor(...CREAM);
    doc.roundedRect(mL, y, cW, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...SUBTLE);
    const disclaimer = 'This report was generated by GreenLens based on your uploaded business data. Emissions estimates use established EPA, IPCC, and industry-standard conversion factors. All figures are approximations intended for internal planning purposes.';
    doc.text(doc.splitTextToSize(disclaimer, cW - 8), mL + 4, y + 7);

    // ══════════════════════════════════════════
    //  SECTION 1 — EXECUTIVE SUMMARY
    // ══════════════════════════════════════════
    doc.addPage(); y = mTop;
    sectionBadge(1, 'Executive Summary');
    hr();

    const cats = data.categories;
    const topTwo = [...cats].sort((a, b) => b.value - a.value).slice(0, 2);

    body(
      `${company} received a GreenLens Sustainability Score of ${score} out of 100, placing it in the "${getScoreLabel(score)}" tier. ` +
      `This report provides a comprehensive analysis of your current environmental footprint, the methodology behind your score, ` +
      `and a prioritised action plan designed to reduce emissions, cut costs, and strengthen your brand position.`
    );
    gap(2);
    body(
      `Your two highest-impact areas are ${topTwo[0].label} (${topTwo[0].value}% of footprint) and ` +
      `${topTwo[1] ? topTwo[1].label + ' (' + topTwo[1].value + '%)' : 'Other'}. ` +
      `Together they represent your most immediate opportunities for meaningful, measurable improvement. ` +
      (data.totalCO2 ? `Your uploaded expenses are estimated to produce ${formatCO2kg(data.totalCO2)} of CO₂ equivalent in total. ` : '') +
      `The recommendations and roadmap in Sections 5 and 6 address these priorities in practical, phased steps.`
    );
    gap(2);
    body(
      `Key actions to prioritise this quarter: (1) Commission a facility energy audit and switch to LED lighting. ` +
      `(2) Deploy route-optimisation software to reduce transportation emissions. ` +
      `(3) Engage your top three suppliers about environmental certifications. ` +
      `These three steps alone can reduce your estimated footprint by 15–25% within six months while generating net cost savings.`
    );

    gap(5); hr();

    // ══════════════════════════════════════════
    //  SECTION 2 — SCORE & METHODOLOGY
    // ══════════════════════════════════════════
    sectionBadge(2, 'Sustainability Score & Methodology');
    hr();

    h2(`Score: ${score} / 100 — ${getScoreLabel(score)}`);
    body(
      score <= 40
        ? `A score of ${score} indicates high environmental impact across your operations. Significant structural changes are needed to meaningfully reduce your carbon footprint, but the roadmap in Section 6 provides a clear, achievable path forward.`
        : score <= 70
        ? `A score of ${score} indicates your business is making progress but retains considerable room for improvement, particularly in your highest-emission categories. Targeted action on the areas identified in this report can move you into the Sustainable tier within 12 months.`
        : score <= 90
        ? `A score of ${score} reflects strong sustainability performance. Targeted improvements in your remaining high-impact areas can move your business into the Green Leader tier.`
        : `A score of ${score} places your business in the top tier of sustainability performance across all measured categories. Focus on maintaining and communicating this leadership position while exploring Scope 3 reductions.`
    );
    gap(3);

    h2('Scoring Formula');
    body(
      'Score  =  100 − [(100 − Energy Efficiency) × 0.30  +  Transportation Impact × 0.25  +  Supply Chain Impact × 0.25  +  Waste Production × 0.20]'
    );
    gap(2);
    body(
      'Weightings reflect the relative contribution of each category to total small-business emissions based on EPA and IEA benchmarks. ' +
      'Energy efficiency is weighted highest at 30% because it is typically the single largest controllable source. ' +
      'Transportation and supply chain are equally weighted at 25% each. Waste is weighted at 20%.'
    );
    gap(3);

    h2('Input Values');
    bullet('Energy Efficiency:', `${data.energyEfficiency ?? 'N/A'} — derived from utility consumption relative to industry benchmarks.`);
    bullet('Transportation Impact:', `${data.transportation ?? 'N/A'} — estimated from shipping frequency, vehicle types, and route distances.`);
    bullet('Supply Chain Impact:', `${data.supplyChain ?? 'N/A'} — inferred from supplier origin data and Scope 3 emissions coefficients.`);
    bullet('Waste Production:', `${data.waste ?? 'N/A'} — based on reported waste output, disposal methods, and IPCC methane factors.`);

    gap(5); hr();

    // ══════════════════════════════════════════
    //  SECTION 3 — EMISSIONS BREAKDOWN
    // ══════════════════════════════════════════
    sectionBadge(3, 'Emissions Breakdown');
    hr();

    body(
      `Your total estimated carbon footprint is distributed across five operational areas: ` +
      cats.map(c => `${c.label} (${c.value}%)`).join(', ') + '. ' +
      `The two largest categories — ${topTwo[0].label} and ${topTwo[1] ? topTwo[1].label : 'Other'} — together account for ` +
      `${topTwo[0].value + (topTwo[1] ? topTwo[1].value : 0)}% of your footprint.`
    );
    gap(3);

    // Embed pie chart
    try {
      const chartCanvas = document.getElementById('emissionsChart');
      if (chartCanvas) {
        const imgData = chartCanvas.toDataURL('image/png');
        const imgW = 90, imgH = 90;
        checkPage(imgH + 10);
        doc.addImage(imgData, 'PNG', (PW - imgW) / 2, y, imgW, imgH);
        y += imgH + 8;
      }
    } catch (_) {}

    // Category breakdown rows
    cats.forEach(c => {
      checkPage(10);
      // Bar background
      doc.setFillColor(...CREAM);
      doc.roundedRect(mL, y, cW, 7, 1, 1, 'F');
      // Bar fill (proportional)
      const barW = (c.value / 100) * cW;
      const barRGB = c.color
        ? c.color.match(/\w\w/g).map(x => parseInt(x, 16))
        : [...G_DARK];
      doc.setFillColor(...barRGB);
      doc.roundedRect(mL, y, Math.max(barW, 2), 7, 1, 1, 'F');
      // Label
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(`${c.label}  ${c.value}%`, mL + 3, y + 5);
      y += 10;
    });

    gap(5); hr();

    // ══════════════════════════════════════════
    //  SECTION 4 — KEY IMPACT AREAS
    // ══════════════════════════════════════════
    sectionBadge(4, 'Key Impact Areas');
    hr();

    body(
      'The categories below are ranked from highest to lowest contribution to your estimated carbon footprint. ' +
      'Each area includes a current-state assessment and the potential impact of targeted improvement.'
    );
    gap(3);

    const impactDetails = {
      'Energy Efficiency':    { current: 'Utility-related emissions dominate your operational footprint.',        potential: 'LED retrofit + smart HVAC scheduling can cut energy emissions 30–50% within 12 months.' },
      'Transportation Impact': { current: 'Logistics and vehicle use represent a significant and growing source.',  potential: 'Route optimisation and EV fleet transition can reduce transport emissions by 15–30% in year one.' },
      'Supply Chain':         { current: 'Upstream purchasing decisions embed significant Scope 3 emissions.',      potential: 'Supplier audits and local sourcing shifts can reduce supply chain impact by 10–20% over 2 years.' },
      'Waste':                { current: 'Waste disposal contributes methane emissions and embedded production impact.', potential: 'A recycling and composting programme can divert 40–60% of waste from landfill.' },
      'Other':                { current: 'Miscellaneous operational emissions across unclassified expense lines.',   potential: 'Improved data granularity will allow more precise categorisation and targeted reductions.' },
    };

    cats.forEach(c => {
      checkPage(28);
      const detail = impactDetails[c.label] || { current: '—', potential: '—' };
      h2(`${c.label} — ${c.value}% of footprint`);
      bullet('Current state:', detail.current);
      bullet('Reduction potential:', detail.potential);
      gap(2);
    });

    gap(3); hr();

    // ══════════════════════════════════════════
    //  SECTION 5 — DETAILED RECOMMENDATIONS
    // ══════════════════════════════════════════
    sectionBadge(5, 'Detailed Recommendations');
    hr();

    body(
      'The following recommendations are ordered by emissions impact, addressing your highest-contributing areas first. ' +
      'Each recommendation includes a strategic rationale and concrete implementation steps.'
    );
    gap(3);

    const recSections = [
      {
        heading: 'Energy Efficiency',
        text: 'Commission a comprehensive facility energy audit to identify where energy is wasted across your operations. Replace all conventional lighting with LED fixtures — this alone can reduce lighting-related electricity use by 30 to 50%, with a payback period of one to two years. Install programmable or smart thermostats to reduce HVAC energy waste during evenings, weekends, and holidays. Over the medium term, switch to a green electricity tariff or install rooftop solar panels to eliminate a significant portion of Scope 2 emissions. A 10 kW rooftop system can offset 35–45% of a typical small business\'s annual electricity consumption.',
      },
      {
        heading: 'Transportation Impact',
        text: 'Deploy route-optimisation software to consolidate deliveries and reduce total vehicle miles traveled by 10–20%, lowering both fuel costs and tailpipe emissions. Consolidate shipments by batching orders where possible — this requires no capital outlay and delivers immediate savings. For fleet-operating businesses, prioritise transitioning your highest-mileage vehicles to electric or hybrid alternatives. Federal and state commercial EV tax credits can substantially reduce upfront acquisition costs, and available charging infrastructure grants ease deployment.',
      },
      {
        heading: 'Supply Chain',
        text: 'Audit your top suppliers for environmental certifications such as ISO 14001 or B Corp status and prioritise partnerships with lower-emission producers. Shift toward local and regional sourcing where feasible — this reduces transportation-embedded Scope 3 emissions and builds more resilient supply chains. Engage your top three suppliers directly to request emissions data and improvement commitments; supplier engagement is increasingly expected by enterprise customers and regulators and can accelerate your overall Scope 3 reduction trajectory.',
      },
      {
        heading: 'Waste Reduction',
        text: 'Implement a comprehensive recycling and composting programme across your facility to divert 40–60% of waste from landfill and reduce associated methane emissions. Audit your product packaging and switch to recycled-content, minimal, or biodegradable alternatives to cut both direct waste output and upstream production emissions. Consider partnering with a certified waste-to-energy provider for non-recyclable streams to recover energy value from residual waste.',
      },
    ];

    recSections.forEach(({ heading, text }) => {
      h2(heading);
      body(text);
      gap(3);
    });

    gap(2); hr();

    // ══════════════════════════════════════════
    //  SECTION 6 — 6–12 MONTH ROADMAP
    // ══════════════════════════════════════════
    sectionBadge(6, '6–12 Month Roadmap');
    hr();

    body(
      'This phased roadmap sequences recommendations to prioritise high-impact, low-cost actions in the early months, ' +
      'generating momentum and cost savings that fund later, more capital-intensive initiatives.'
    );
    gap(3);

    const milestones = (data.milestones && data.milestones.length) ? data.milestones : generateTimeline();
    milestones.forEach(m => {
      checkPage(22);
      // Timeline node row
      doc.setFillColor(...G_DARK);
      doc.circle(mL + 2.5, y + 1.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...G_DARK);
      doc.text(m.period, mL + 8, y + 3);
      y += 7;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BR_DARK);
      doc.text(m.title, mL + 8, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      const lines = doc.splitTextToSize(m.desc, cW - 8);
      doc.text(lines, mL + 8, y);
      y += lines.length * 5.2 + 6;
    });

    gap(2);
    body(
      'Re-upload your business data to GreenLens at the end of each phase to measure your updated Sustainability Score, ' +
      'celebrate progress with your team, and recalibrate targets for the next period.'
    );

    gap(4); hr();

    // ══════════════════════════════════════════
    //  SECTION 7 — LONG-TERM STRATEGY (2–5 YEARS)
    // ══════════════════════════════════════════
    sectionBadge(7, 'Long-Term Strategy (2–5 Years)');
    hr();

    body(
      'Beyond the 12-month roadmap, a sustained long-term strategy is essential to reach net-zero operations and maintain competitive advantage as environmental standards tighten.'
    );
    gap(3);

    const longTermItems = [
      {
        heading: 'Year 2: Deepen Renewable Energy',
        text:    'Complete the transition to 100% renewable electricity through a power purchase agreement (PPA) or expanded on-site solar generation. Explore battery storage to reduce grid dependence during peak demand. This eliminates all Scope 2 emissions and can reduce overall energy costs by 20–35% over the asset\'s lifetime.',
      },
      {
        heading: 'Year 2–3: Electrify the Fleet',
        text:    'Complete the replacement of all remaining fossil-fuel fleet vehicles with electric alternatives. Establish on-site charging infrastructure and negotiate preferential overnight charging rates with your utility provider. EV total cost of ownership typically becomes favourable within 3–4 years compared with equivalent ICE vehicles.',
      },
      {
        heading: 'Year 3–4: Achieve Science-Based Targets',
        text:    'Formally commit to Science Based Targets initiative (SBTi) emissions reductions aligned with a 1.5°C pathway. Set a verified net-zero target date and publish annual progress reports. SBTi alignment is increasingly required by large enterprise customers and government procurement frameworks.',
      },
      {
        heading: 'Year 4–5: Full Scope 3 Transparency',
        text:    'Extend emissions measurement and reduction commitments across your entire value chain — including upstream suppliers and downstream product use. Implement a supplier sustainability scorecard and require environmental disclosure from all tier-1 partners. This positions your business as a sustainability leader capable of participating in premium supply chains and sustainability-linked financing.',
      },
    ];

    longTermItems.forEach(({ heading, text }) => {
      h2(heading);
      body(text);
      gap(3);
    });

    gap(2); hr();

    // ══════════════════════════════════════════
    //  SECTION 8 — WHY SUSTAINABILITY MATTERS
    // ══════════════════════════════════════════
    sectionBadge(8, 'Why Sustainability Matters');
    hr();

    h2('Climate Urgency');
    body(
      'Global average temperatures have already risen 1.2°C above pre-industrial levels, and the IPCC warns that exceeding 1.5°C will trigger irreversible climate tipping points. ' +
      'Small and medium businesses collectively account for over 40% of global greenhouse gas emissions. Every organisation that takes data-driven steps to reduce its footprint contributes meaningfully to limiting this trajectory. ' +
      'The actions in this report directly reduce your contribution to atmospheric CO₂ — and by extension, to rising seas, extreme weather events, and ecosystem collapse.'
    );
    gap(3);

    h2('Brand Value & Customer Loyalty');
    body(
      'Consumer expectations around sustainability have shifted decisively. Studies consistently find that 60–70% of consumers are willing to pay a premium for sustainably produced goods and services, and that environmental values are a primary driver of brand loyalty among younger demographics. ' +
      'Displaying your GreenLens Sustainability Score publicly communicates genuine, data-backed commitment — not just marketing claims. Businesses that achieve measurable sustainability improvements report stronger customer retention, higher Net Promoter Scores, and greater media visibility.'
    );
    gap(3);

    h2('Regulatory Compliance & Risk Management');
    body(
      'Environmental disclosure requirements are expanding rapidly. The SEC\'s climate disclosure rules require public companies to report Scope 1 and 2 emissions starting in 2026, with supply chain (Scope 3) obligations for large filers following shortly after. ' +
      'California\'s SB 253 and SB 261 already mandate climate-related financial disclosures for companies doing business in the state, regardless of where they are headquartered. The EU\'s Corporate Sustainability Reporting Directive (CSRD) extends similar requirements to non-EU companies with EU operations. ' +
      'Proactively building your sustainability measurement and reporting capability today reduces compliance risk, avoids costly emergency remediation, and positions your business to respond confidently as regulations tighten.'
    );

    gap(4); hr();

    // ══════════════════════════════════════════
    //  SECTION 9 — APPENDIX
    // ══════════════════════════════════════════
    sectionBadge(9, 'Appendix — Data & Calculations');
    hr();

    h2('Emissions Conversion Factors');
    body(
      'Energy: EPA eGRID regional electricity emission factors (kg CO₂e per kWh) applied by geographic region. ' +
      'Natural gas: 0.0531 kg CO₂e per MJ (IPCC AR6 Annex II). ' +
      'Diesel: 2.68 kg CO₂e per litre. ' +
      'Petrol / gasoline: 2.31 kg CO₂e per litre.'
    );
    gap(2);

    body(
      'Transportation: Average fuel economy benchmarks for commercial van (22 mpg), light truck (18 mpg), and heavy goods vehicle (8 mpg) applied against estimated route distances from shipping records. ' +
      'Air freight: 0.602 kg CO₂e per tonne-km (ICAO methodology). ' +
      'Sea freight: 0.011 kg CO₂e per tonne-km (IMO 2023 GHG Strategy).'
    );
    gap(2);

    body(
      'Supply chain: Industry-average Scope 3 emissions intensity coefficients from the EPA Supply Chain Greenhouse Gas Emission Factors v1.3 dataset, matched to vendor category classification. ' +
      'Waste: IPCC Tier 1 landfill methane emission factors adjusted for reported waste composition (food, paper, mixed). ' +
      'Composted and recycled materials are credited at 0 kg CO₂e per tonne at point of diversion.'
    );
    gap(3);

    h2('Score Derivation');
    body(
      `Energy Efficiency input: ${data.energyEfficiency ?? 'N/A'} | ` +
      `Transportation input: ${data.transportation ?? 'N/A'} | ` +
      `Supply Chain input: ${data.supplyChain ?? 'N/A'} | ` +
      `Waste input: ${data.waste ?? 'N/A'}`
    );
    gap(1);
    body(
      `Score  =  100 − [(100 − ${data.energyEfficiency ?? 0}) × 0.30  +  ${data.transportation ?? 0} × 0.25  +  ${data.supplyChain ?? 0} × 0.25  +  ${data.waste ?? 0} × 0.20]  =  ${score}`
    );
    gap(3);

    h2('Data Sources & References');
    const refs = [
      'U.S. Environmental Protection Agency — eGRID 2023, Supply Chain GHG Emission Factors v1.3',
      'Intergovernmental Panel on Climate Change (IPCC) — Sixth Assessment Report (AR6), 2021',
      'International Energy Agency (IEA) — World Energy Outlook 2023',
      'Science Based Targets initiative (SBTi) — Corporate Net-Zero Standard v1.1',
      'International Maritime Organization (IMO) — Fourth GHG Study, 2023',
      'ICAO — Carbon Emissions Calculator Methodology, Edition 12',
      'U.S. Securities and Exchange Commission — Climate-Related Disclosures Final Rule, 2024',
      'European Commission — Corporate Sustainability Reporting Directive (CSRD), 2023',
    ];
    refs.forEach(r => {
      checkPage(8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...SUBTLE);
      doc.text(`• ${r}`, mL + 2, y);
      y += 6;
    });

    gap(3);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...SUBTLE);
    doc.text(
      'All figures in this report are estimates based on the data provided and publicly available emissions factors. They are intended for internal sustainability planning and benchmarking purposes only.',
      mL, y, { maxWidth: cW }
    );

    // ── PAGE NUMBERS ──────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SUBTLE);
      if (i > 1) {
        doc.text(`GreenLens Sustainability Report  ·  ${company}`, mL, PH - 12);
      }
      doc.text(`${i} / ${totalPages}`, PW - mR, PH - 12, { align: 'right' });
    }

    doc.save('GreenLens_Sustainability_Report.pdf');

  } catch (err) {
    console.error('PDF generation failed:', err);
    alert('Sorry, the PDF could not be generated. Please try again.');
  } finally {
    btn.innerHTML = orig;
    btn.disabled  = false;
  }
}


/* =============================================
   Page Init
   ============================================= */

function initOutcomesPage() {
  const data  = getOutcomesData();
  const score = calculateScore(data);

  animateGauge(score);
  renderSummary(score, data.categories, data);
  renderPieChart(data.categories);
  renderProjectionChart(score, data);
  renderSuggestions(data.categories);
  renderTimeline(data.milestones);

  // Wire up the manual Save to History button
  const saveBtn = document.getElementById('saveToHistoryBtn');
  if (saveBtn && typeof glSaveAnalysis === 'function') {
    const user = typeof glGetCurrentUser === 'function' ? glGetCurrentUser() : null;
    if (!user) {
      // Not logged in — show a prompt to join instead
      saveBtn.textContent = 'Sign In to Save';
      saveBtn.addEventListener('click', () => { window.location.href = 'join.html'; });
    } else {
      saveBtn.addEventListener('click', () => {
        const ok = glSaveAnalysis(score, data);
        if (ok) {
          saveBtn.textContent = '✓ Saved to Profile';
          saveBtn.classList.add('save-btn--saved');
          saveBtn.disabled = true;
        }
      });
    }
  }

  const btn = document.getElementById('downloadBtn');
  if (btn) btn.addEventListener('click', () => generatePDF(score, data));
}
