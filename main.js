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
    const WHITE   = [255, 255, 255];

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

    function h1(text) {
      checkPage(18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...G_DARK);
      doc.text(text, mL, y);
      y += 9;
    }

    function h2(text) {
      checkPage(12);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...BR_DARK);
      doc.text(text, mL, y);
      y += 7;
    }

    function body(text) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...TEXT);
      const lines = doc.splitTextToSize(text, cW);
      checkPage(lines.length * 5.5 + 5);
      doc.text(lines, mL, y);
      y += lines.length * 5.5 + 5;
    }

    function gap(mm = 4) { y += mm; }

    // ── TITLE HEADER ──────────────────────────────────────────
    doc.setFillColor(...G_DARK);
    doc.rect(0, 0, PW, 52, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text('GreenLens', mL, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text('Sustainability Report', mL, 32);

    doc.setFontSize(9);
    doc.setTextColor(214, 232, 212);
    const company = data.companyName || 'Your Business';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.text(`${company}  ·  ${dateStr}`, mL, 45);

    y = 64;

    // Score badge
    const sColor = getScoreColor(score);
    const sRGB = sColor === '#d9534f' ? [217, 83, 79]
               : sColor === '#e8944a' ? [232, 148, 74]
               : sColor === '#c9b645' ? [201, 182, 69]
               : [74, 124, 89];
    doc.setFillColor(...sRGB);
    doc.roundedRect(mL, y, 85, 22, 3, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...WHITE);
    doc.text(String(score), mL + 10, y + 15);
    doc.setFontSize(9);
    doc.text(getScoreLabel(score).toUpperCase(), mL + 30, y + 15);
    y += 30;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SUBTLE);
    const intro = 'This report details your sustainability footprint, score calculation, prioritized recommendations, and a 12-month implementation roadmap.';
    doc.text(doc.splitTextToSize(intro, cW), mL, y);
    y += 14;

    hr();

    // ── SECTION 1: SUSTAINABILITY SCORE ───────────────────────
    h1('1. Sustainability Score');
    h2(`Score: ${score} / 100 — ${getScoreLabel(score)}`);
    body(
      `Your GreenLens Sustainability Score of ${score} places your business in the "${getScoreLabel(score)}" category on a scale of 0 to 100. ` +
      (score <= 40
        ? 'This indicates your operations currently carry a high environmental impact and significant structural changes are needed to meaningfully reduce your carbon footprint.'
        : score <= 70
        ? 'This indicates your business is making progress but has considerable room for improvement, particularly in your highest-emission categories.'
        : score <= 90
        ? 'This indicates strong sustainability performance with targeted opportunities remaining to reach the top tier.'
        : 'This is the highest tier, recognising your business as a leader in sustainable operations across all measured categories.')
    );

    gap();
    h2('How the Score Was Calculated');
    body(
      'Score = 100 − [(100 − Energy Efficiency) × 0.30  +  Transportation Impact × 0.25  +  Supply Chain Impact × 0.25  +  Waste Production × 0.20]. ' +
      'Energy efficiency is weighted most heavily at 30% because it is typically the single largest controllable emission source for small businesses. ' +
      'Transportation and supply chain are weighted equally at 25% each, reflecting their significant but variable impact depending on business model. ' +
      'Waste is weighted at 20% as it is often the smallest contributor but still represents meaningful reduction potential.'
    );

    gap();
    h2('Input Values Used');
    body(
      `Energy Efficiency Score: ${data.energyEfficiency ?? 'N/A'} — derived from utility consumption relative to industry benchmarks for your business size and sector. ` +
      `Transportation Impact Score: ${data.transportation ?? 'N/A'} — estimated from shipping frequency, vehicle types, and average route distances weighted by fuel type. ` +
      `Supply Chain Impact: ${data.supplyChain ?? 'N/A'} — inferred from supplier origin data, procurement volumes, and industry-average Scope 3 emissions coefficients. ` +
      `Waste Production Score: ${data.waste ?? 'N/A'} — based on reported waste output and disposal methods, applying standard landfill methane emission factors.`
    );

    gap(5); hr();

    // ── SECTION 2: CARBON EMISSIONS BREAKDOWN ─────────────────
    h1('2. Carbon Emissions Breakdown');
    const cats = data.categories;
    body(
      `Your total estimated carbon footprint is distributed across five operational areas: ` +
      `${cats[0].label} (${cats[0].value}%), ${cats[1].label} (${cats[1].value}%), ` +
      `${cats[2].label} (${cats[2].value}%), ${cats[3].label} (${cats[3].value}%), ` +
      `and ${cats[4].label} (${cats[4].value}%). ` +
      `The two largest categories together account for ${cats[0].value + cats[1].value}% of your footprint and represent your highest-priority areas for action.`
    );

    gap();

    // Embed pie chart image from canvas
    try {
      const chartCanvas = document.getElementById('emissionsChart');
      if (chartCanvas) {
        const imgData = chartCanvas.toDataURL('image/png');
        const imgW = 90, imgH = 90;
        checkPage(imgH + 8);
        doc.addImage(imgData, 'PNG', (PW - imgW) / 2, y, imgW, imgH);
        y += imgH + 6;
      }
    } catch (_) {}

    body(
      'Each category value was estimated using your uploaded data combined with established emissions conversion factors. ' +
      'Energy figures apply EPA eGRID regional electricity emission factors for your geographic area. ' +
      'Transportation emissions use average fuel economy data for common commercial vehicle types matched against your shipping records. ' +
      'Supply chain values incorporate industry-average Scope 3 emissions intensity coefficients from the EPA Supply Chain Greenhouse Gas Emission Factors dataset. ' +
      'Waste figures apply standard IPCC landfill methane emission factors adjusted for your reported waste composition and local waste management practices.'
    );

    gap(5); hr();

    // ── SECTION 3: RECOMMENDATIONS ────────────────────────────
    h1('3. Recommendations');
    body(
      'The following recommendations are organized by emissions impact, addressing your highest-contributing areas first. ' +
      'Both broad strategic approaches and specific, actionable steps are provided for each category.'
    );
    gap();

    const recSections = [
      {
        heading: 'Energy Efficiency',
        text: 'Your energy consumption represents the single largest share of your carbon footprint. The most impactful first step is a comprehensive energy audit to identify where energy is being wasted across your facility. In concrete terms, replacing conventional lighting with LED fixtures can reduce lighting-related electricity use by 30 to 50 percent, with a typical payback period of one to two years. Installing programmable or smart thermostats and scheduling HVAC systems around actual occupancy can further reduce waste during evenings, weekends, and holidays. Over the medium term, transitioning to renewable energy — either through a green electricity tariff or a rooftop solar installation — can eliminate a significant portion of your purchased-electricity emissions entirely. A 10 kW rooftop solar system can offset 35 to 45 percent of a typical small business\'s annual electricity consumption depending on location.',
      },
      {
        heading: 'Transportation Impact',
        text: 'Transportation is your second-largest emission source, and logistics optimisation is one of the fastest ways to reduce it without significant capital outlay. Route-optimisation software can reduce total vehicle miles traveled by 10 to 20 percent for businesses with regular delivery operations, lowering both fuel costs and emissions simultaneously. Consolidating shipments — batching orders to reduce the number of individual trips — further reduces consumption without requiring any infrastructure change. For businesses operating a vehicle fleet, transitioning your highest-mileage vehicles to electric or hybrid alternatives offers the largest long-term reduction. Federal and state tax credits for commercial EV purchases can substantially reduce the upfront cost of this transition, and available charging infrastructure grants can ease deployment.',
      },
      {
        heading: 'Supply Chain',
        text: 'Your supply chain represents embedded emissions from the production and transport of goods and materials your business purchases — often called Scope 3 emissions. Evaluating your key suppliers for environmental certifications such as ISO 14001 or B Corp status can help you prioritise partnerships with lower-emission producers. Shifting toward local and regional sourcing reduces transportation-related Scope 3 emissions and often supports shorter, more resilient supply chains. Engaging your top suppliers directly to request emissions data and improvement commitments can accelerate broader supply chain decarbonisation and position your business as a preferred partner for like-minded customers.',
      },
      {
        heading: 'Waste Reduction',
        text: 'Waste production, while currently your smallest significant category, represents a straightforward area for measurable improvement with limited upfront cost. Implementing a comprehensive recycling and composting program across your facility can divert 40 to 60 percent of waste from landfill, reducing methane emissions from organic decomposition. Auditing your packaging across all products and switching to recycled-content, minimal, or biodegradable alternatives reduces both direct waste output and the upstream emissions embedded in packaging production. Partnering with a certified waste-to-energy provider for non-recyclable waste streams is an additional step to capture remaining emissions reductions while potentially recovering energy value.',
      },
    ];

    recSections.forEach(({ heading, text }) => {
      h2(heading);
      body(text);
      gap(2);
    });

    gap(3); hr();

    // ── SECTION 4: IMPLEMENTATION TIMELINE ───────────────────
    h1('4. Implementation Timeline');
    body(
      'The following roadmap organises the recommendations above into a phased, 12-month action plan. ' +
      'The sequencing prioritises high-impact, low-cost actions in the early months to generate momentum, ' +
      'followed by more capital-intensive initiatives as your sustainability programme matures and early savings begin to accrue.'
    );
    gap();

    const milestones = (data.milestones && data.milestones.length) ? data.milestones : generateTimeline();
    milestones.forEach(m => {
      h2(`${m.period}: ${m.title}`);
      body(m.desc);
      gap(2);
    });

    gap(2);
    body(
      'By following this roadmap, your business is positioned to achieve meaningful, measurable emissions reductions within a single year. ' +
      'Each phase builds on the previous one, ensuring that early investments in energy efficiency and transportation create financial headroom for subsequent supply chain and waste initiatives. ' +
      'We recommend re-uploading your data to GreenLens at the end of each major phase to track progress and recalibrate the plan as needed.'
    );

    gap(4); hr();

    // ── SECTION 5: WHY IT MATTERS ─────────────────────────────
    h1('5. Why It Matters');
    body(
      'The actions outlined in this report are not just good for your bottom line — they are part of a broader global effort to limit warming to 1.5°C above pre-industrial levels, as called for by the Paris Agreement. ' +
      'Small and medium-sized businesses collectively account for a significant share of global greenhouse gas emissions. ' +
      'When businesses like yours take concrete, data-driven steps to reduce their footprint, the cumulative effect is substantial: lower demand for fossil fuels, less pressure on landfills, cleaner supply chains, and healthier communities. ' +
      'Your commitment to sustainability also signals to customers, partners, and employees that your business is invested in the long-term health of the planet — an increasingly important differentiator in today\'s market.'
    );

    gap(3);
    body(
      'We encourage you to share your sustainability journey and your GreenLens Sustainability Score with customers and stakeholders. ' +
      'Transparency about environmental performance is increasingly valued by consumers and can meaningfully differentiate your business in a competitive market. ' +
      'If you found this analysis valuable, we warmly invite you to recommend GreenLens to fellow business owners in your network. ' +
      'Together, we can help more businesses understand and reduce their environmental impact — one data upload at a time.'
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
  renderSuggestions(data.categories);
  renderTimeline(data.milestones);

  const btn = document.getElementById('downloadBtn');
  if (btn) btn.addEventListener('click', () => generatePDF(score, data));
}
