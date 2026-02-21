/* ============================================================
   GreenLens — Upload & Analysis Engine
   ============================================================ */

// ── Emission Factors (kg CO₂ per USD spent, sourced from EPA/EEIO)
const EMISSION_FACTORS = {
  energy:     0.233,   // kg CO₂ per $1 on electricity/energy
  transport:  0.181,   // kg CO₂ per $1 on transportation/fuel
  supply:     0.142,   // kg CO₂ per $1 on supply chain/materials
  waste:      0.098,   // kg CO₂ per $1 on waste management
  other:      0.120,   // kg CO₂ per $1 (generic average)
};

// ── Category metadata
const CATEGORIES = {
  energy:    { label: 'Energy Efficiency',    color: 'energy',    emoji: '⚡' },
  transport: { label: 'Transportation Impact', color: 'transport', emoji: '🚚' },
  supply:    { label: 'Supply Chain',          color: 'supply',    emoji: '📦' },
  waste:     { label: 'Waste',                 color: 'waste',     emoji: '♻️' },
  other:     { label: 'Other',                 color: 'other',     emoji: '·'  },
};

// ── Rule-based keyword dictionary
const KEYWORD_RULES = {
  energy: [
    'pge','pg&e','con edison','conedison','duke energy','duke','dominion',
    'entergy','xcel','southern company','national grid','eversource',
    'electric','electricity','utility','utilities','power bill','power company',
    'kwh','kilowatt','solar','solar panel','renewable','wind energy',
    'natural gas','gas bill','gas company','gas utility','sempra','atmos',
    'piedmont natural gas','nv energy','we energies','ameren','dte energy',
    'pseg','comed','aep','firstenergy','ppg','lighting','hvac','generator',
  ],
  transport: [
    'shell','bp','chevron','exxon','exxonmobil','mobil','valero','marathon',
    'citgo','sunoco','arco','texaco','76','circle k','speedway','wawa',
    'gasoline','diesel','petrol','fuel','gas station','jet fuel','aviation fuel',
    'uber','lyft','taxi','fleet','vehicle','car rental','hertz','enterprise',
    'avis','budget rental','rideshare','mileage','tolls','parking',
    'ups','fedex','dhl','usps','maersk','freight','logistics','courier',
    'shipping','shipment','delivery','trucking','amazon logistics',
    'xpo logistics','ch robinson','j.b. hunt','werner','swift transport',
    'air freight','ocean freight','cargo','3pl','last mile',
    'airline','delta','united','american airlines','southwest','flight',
    'amtrak','train','rail','transit',
  ],
  supply: [
    'amazon','amazon business','staples','office depot','uline','grainger',
    'fastenal','w.w. grainger','mcmaster-carr','home depot','lowes','lowe\'s',
    'packaging','raw material','raw materials','inventory','stock','supplies',
    'lumber','timber','steel','aluminum','copper','plastic','resin',
    'fabric','textile','paper','cardboard','glass','chemical','chemicals',
    'manufacturer','supplier','vendor','wholesale','distributor',
    'office supplies','equipment','tools','hardware','parts','components',
    'food supplier','produce','wholesale food','sysco','us foods','gordon food',
    'printing','print shop','materials','manufacturing',
  ],
  waste: [
    'waste management','republic services','clean harbors','stericycle',
    'covanta','casella waste','recology','advanced disposal','rumpke',
    'waste connections','clean earth','us ecology',
    'recycling','disposal','landfill','dumpster','trash','garbage',
    'compost','composting','hazardous waste','e-waste','scrap',
    'sewage','wastewater','sanitation','janitorial','cleaning service',
    'rubbish','refuse','incineration',
  ],
};

// ── DOM refs
const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const fileSelected    = document.getElementById('fileSelected');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const removeFileBtn   = document.getElementById('removeFile');
const analyzeBtn      = document.getElementById('analyzeBtn');
const uploadError     = document.getElementById('uploadError');
const errorText       = document.getElementById('errorText');
const retryRulesOnly  = document.getElementById('retryRulesOnly');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingStatus   = document.getElementById('loadingStatus');
const resultsSection  = document.getElementById('resultsSection');
const summaryCards    = document.getElementById('summaryCards');
const emissionsNarrative = document.getElementById('emissionsNarrative');
const resultsTableBody = document.getElementById('resultsTableBody');
const tableCount      = document.getElementById('tableCount');
const viewOutcomesBtn = document.getElementById('viewOutcomesBtn');
const resetBtn        = document.getElementById('resetBtn');

let selectedFile = null;
let parsedRows   = [];

// ── Drag & Drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

// ── Browse button
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

// ── Remove file
removeFileBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileSelected.hidden = true;
  dropZone.querySelector('.upload-box-inner').hidden = false;
  analyzeBtn.disabled = true;
  hideError();
});

// ── Analyze button
analyzeBtn.addEventListener('click', () => runAnalysis(false));
retryRulesOnly.addEventListener('click', () => runAnalysis(true));
resetBtn.addEventListener('click', () => {
  resultsSection.hidden = true;
  selectedFile = null;
  fileInput.value = '';
  fileSelected.hidden = true;
  dropZone.querySelector('.upload-box-inner').hidden = false;
  analyzeBtn.disabled = true;
  hideError();
  try { localStorage.removeItem('greenlens_analysis'); } catch {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Restore previous results on page load
(function restoreFromLocalStorage() {
  try {
    const saved = localStorage.getItem('greenlens_analysis');
    if (!saved) return;
    const data = JSON.parse(saved);
    if (!data.rows || data.rows.length === 0) return;
    parsedRows = data.rows;
    renderResults(data.rows);
    resultsSection.hidden = false;
  } catch {}
})();

function handleFileSelect(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    showError('Please upload a .csv file.'); return;
  }
  selectedFile = file;
  fileNameDisplay.textContent = file.name;
  dropZone.querySelector('.upload-box-inner').hidden = true;
  fileSelected.hidden = false;
  analyzeBtn.disabled = false;
  hideError();
}

// ────────────────────────────────────────────
// CSV PARSER
// ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row.');

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Flexible column mapping
  const colMap = {
    date:        findCol(headers, ['date','transaction date','txn date','posted date','time']),
    vendor:      findCol(headers, ['vendor','supplier','merchant','payee','company','name','description','memo','details','expense','item']),
    description: findCol(headers, ['description','desc','details','memo','notes','item','product','service','category']),
    amount:      findCol(headers, ['amount','cost','price','total','charge','debit','spend','value','usd','dollars']),
  };

  if (colMap.amount === -1) throw new Error('Could not find an Amount column. Please ensure your CSV has a cost/amount column.');
  if (colMap.vendor === -1 && colMap.description === -1) throw new Error('Could not find a Vendor or Description column. CSV needs at least 2 identifiable columns.');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCSVLine(line);

    const rawVendor = (colMap.vendor >= 0 ? cells[colMap.vendor] : '') || '';
    const rawDesc   = (colMap.description >= 0 ? cells[colMap.description] : '') || '';
    const rawAmount = (colMap.amount >= 0 ? cells[colMap.amount] : '0') || '0';
    const rawDate   = (colMap.date >= 0 ? cells[colMap.date] : '') || '';

    const vendor = rawVendor.replace(/['"]/g, '').trim();
    const desc   = rawDesc.replace(/['"]/g, '').trim();
    const amount = parseFloat(rawAmount.replace(/[^0-9.\-]/g, '')) || 0;

    if (amount === 0 && !vendor && !desc) continue;

    rows.push({ vendor, description: desc, amount: Math.abs(amount), date: rawDate.replace(/['"]/g, '').trim(), raw: cells });
  }

  if (rows.length === 0) throw new Error('No valid data rows found in the CSV.');
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

// ────────────────────────────────────────────
// RULE-BASED CATEGORIZER
// ────────────────────────────────────────────
function ruleBasedCategory(vendor, description) {
  const text = (vendor + ' ' + description).toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORD_RULES)) {
    for (const kw of keywords) {
      if (text.includes(kw)) return { category: cat, confidence: 'rule' };
    }
  }
  return null;
}

// ────────────────────────────────────────────
// AI CATEGORIZER (Anthropic Claude)
// ────────────────────────────────────────────
async function aiCategorize(unknownRows) {
  const apiKey = (typeof ANTHROPIC_API_KEY !== 'undefined') ? ANTHROPIC_API_KEY.trim() : null;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return unknownRows.map(r => ({ ...r, category: 'other', confidence: 'low' }));
  }

  const payload = unknownRows.map((r, i) => `${i + 1}. Vendor: "${r.vendor}" | Description: "${r.description}" | Amount: $${r.amount.toFixed(2)}`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `You are a sustainability analyst helping categorize business expenses by emission type.
For each expense, assign exactly one category from: energy, transport, supply, waste, or other.
- energy: electricity bills, gas utilities, power companies, solar, HVAC
- transport: fuel, shipping carriers, freight, flights, vehicle rentals, couriers
- supply: raw materials, office supplies, manufacturing inputs, packaging, wholesale goods
- waste: waste disposal, recycling services, sanitation, cleaning
- other: anything that doesn't clearly fit above
Return ONLY a valid JSON array. Each element must have: index (number), category (string), confidence (high/medium/low).
No extra text, no markdown, just the raw JSON array.`,
      messages: [{ role: 'user', content: `Categorize these business expenses:\n${payload}` }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.content[0].text.trim();

  let parsed;
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    throw new Error('AI returned malformed JSON. Falling back to rules.');
  }

  return unknownRows.map((row, i) => {
    const aiResult = parsed.find(p => p.index === i + 1);
    return {
      ...row,
      category:   aiResult ? aiResult.category : 'other',
      confidence: aiResult ? aiResult.confidence : 'low',
    };
  });
}

// ────────────────────────────────────────────
// MAIN ANALYSIS PIPELINE
// ────────────────────────────────────────────
async function runAnalysis(rulesOnly = false) {
  hideError();
  resultsSection.hidden = true;
  showLoading('Parsing CSV file…');

  let rawText;
  try {
    rawText = await readFileAsText(selectedFile);
  } catch (e) {
    hideLoading(); showError('Could not read the file. ' + e.message); return;
  }

  let rows;
  try {
    rows = parseCSV(rawText);
  } catch (e) {
    hideLoading(); showError(e.message); return;
  }

  setLoadingStatus('Categorizing expenses…');

  // First pass: rule-based
  const categorized = [];
  const needsAI     = [];

  for (const row of rows) {
    const match = ruleBasedCategory(row.vendor, row.description);
    if (match) {
      categorized.push({ ...row, category: match.category, confidence: 'rule' });
    } else {
      needsAI.push(row);
    }
  }

  // Second pass: AI fallback
  if (needsAI.length > 0 && !rulesOnly) {
    setLoadingStatus(`Sending ${needsAI.length} unknown expense${needsAI.length > 1 ? 's' : ''} to AI…`);
    try {
      const aiResults = await aiCategorize(needsAI);
      categorized.push(...aiResults);
    } catch (e) {
      hideLoading();
      showError('AI categorization failed: ' + e.message, true);
      needsAI.forEach(r => categorized.push({ ...r, category: 'other', confidence: 'low' }));
    }
  } else if (needsAI.length > 0 && rulesOnly) {
    needsAI.forEach(r => categorized.push({ ...r, category: 'other', confidence: 'low' }));
  }

  // Add CO₂ estimates
  const finalRows = categorized.map(row => ({
    ...row,
    co2kg: +(row.amount * (EMISSION_FACTORS[row.category] || EMISSION_FACTORS.other)).toFixed(2),
  }));

  parsedRows = finalRows;

  setLoadingStatus('Building your report…');
  await sleep(400);

  hideLoading();
  renderResults(finalRows);
  saveToLocalStorage(finalRows);

  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ────────────────────────────────────────────
// RESULTS RENDERER
// ────────────────────────────────────────────
function renderResults(rows) {
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const totalCO2    = rows.reduce((s, r) => s + r.co2kg, 0);

  // Aggregate by category
  const byCategory = {};
  for (const cat of Object.keys(CATEGORIES)) {
    byCategory[cat] = { amount: 0, co2: 0, count: 0 };
  }
  for (const row of rows) {
    const cat = byCategory[row.category] ? row.category : 'other';
    byCategory[cat].amount += row.amount;
    byCategory[cat].co2    += row.co2kg;
    byCategory[cat].count  += 1;
  }

  // Summary banner text
  document.getElementById('resultsSummaryText').textContent =
    `Analyzed ${rows.length} expense${rows.length !== 1 ? 's' : ''} totaling ${formatCurrency(totalAmount)} — estimated ${formatCO2(totalCO2)} of CO₂ equivalent.`;

  // Summary cards
  summaryCards.innerHTML = '';
  for (const [catKey, meta] of Object.entries(CATEGORIES)) {
    const d = byCategory[catKey];
    if (d.count === 0) continue;
    const pct = totalAmount > 0 ? ((d.amount / totalAmount) * 100).toFixed(1) : '0';
    summaryCards.innerHTML += `
      <div class="summary-card summary-card--${meta.color}">
        <div class="summary-card-icon">${meta.emoji}</div>
        <div class="summary-card-body">
          <p class="summary-cat-label">${meta.label}</p>
          <p class="summary-amount">${formatCurrency(d.amount)}</p>
          <p class="summary-pct">${pct}% of spend</p>
          <p class="summary-co2">${formatCO2(d.co2)} CO₂e</p>
        </div>
        <div class="summary-bar-wrap">
          <div class="summary-bar" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  // Narrative
  const topCat = Object.entries(byCategory).sort((a, b) => b[1].co2 - a[1].co2)[0];
  const topMeta = CATEGORIES[topCat[0]];
  emissionsNarrative.innerHTML = buildNarrative(rows, byCategory, totalAmount, totalCO2, topCat[0], topMeta);

  // Table
  resultsTableBody.innerHTML = '';
  tableCount.textContent = `${rows.length} item${rows.length !== 1 ? 's' : ''}`;
  for (const row of rows) {
    const catMeta = CATEGORIES[row.category] || CATEGORIES.other;
    const label   = row.vendor || row.description || 'Unknown';
    const desc    = row.vendor && row.description ? row.description : '';
    resultsTableBody.innerHTML += `
      <tr>
        <td>
          <span class="row-vendor">${escapeHtml(label)}</span>
          ${desc ? `<span class="row-desc">${escapeHtml(desc)}</span>` : ''}
        </td>
        <td class="row-amount">${formatCurrency(row.amount)}</td>
        <td><span class="row-cat row-cat--${catMeta.color}">${catMeta.emoji} ${catMeta.label}</span></td>
        <td class="row-co2">${formatCO2(row.co2kg)}</td>
        <td><span class="confidence-badge confidence-badge--${row.confidence}">${confidenceLabel(row.confidence)}</span></td>
      </tr>`;
  }
}

function buildNarrative(rows, byCategory, totalAmount, totalCO2, topCatKey, topMeta) {
  const topData = byCategory[topCatKey];
  const topPct  = totalAmount > 0 ? ((topData.amount / totalAmount) * 100).toFixed(0) : 0;
  const trees   = Math.round(totalCO2 / 21);

  let tips = '';
  if (topCatKey === 'transport') tips = 'Consider consolidating shipments, switching to lower-emission carriers, or transitioning part of your fleet to electric vehicles.';
  else if (topCatKey === 'energy') tips = 'Switching to a renewable energy tariff or investing in LED lighting and smart HVAC controls could significantly reduce this footprint.';
  else if (topCatKey === 'supply') tips = 'Sourcing from local suppliers, choosing recycled or sustainably certified materials, and reducing packaging can cut supply chain emissions.';
  else if (topCatKey === 'waste') tips = 'Implementing a waste reduction programme, composting food waste, and partnering with a recycling service can lower this substantially.';
  else tips = 'Review uncategorized expenses — many may hide significant emission sources worth targeting.';

  return `
    <div class="narrative-block">
      <h3 class="narrative-title">What your data is telling us</h3>
      <p>Based on your uploaded expenses, your business generates an estimated <strong>${formatCO2(totalCO2)} of CO₂ equivalent</strong> — roughly equivalent to the annual carbon absorption of <strong>${trees.toLocaleString()} trees</strong>.</p>
      <p>Your biggest emission driver is <strong>${topMeta.emoji} ${topMeta.label}</strong>, which accounts for <strong>${topPct}%</strong> of your total spend (${formatCurrency(topData.amount)}) and an estimated <strong>${formatCO2(topData.co2)} CO₂e</strong>. ${tips}</p>
      <p>Head to the <a href="outcomes.html" class="narrative-link">Outcomes page</a> for a full set of tailored, priority-ranked recommendations based on this analysis.</p>
    </div>`;
}

// ────────────────────────────────────────────
// LOCALSTORAGE HANDOFF
// ────────────────────────────────────────────
function saveToLocalStorage(rows) {
  const summary = {};
  for (const cat of Object.keys(CATEGORIES)) {
    summary[cat] = { amount: 0, co2: 0, count: 0 };
  }
  let totalAmount = 0, totalCO2 = 0;
  for (const row of rows) {
    const cat = summary[row.category] ? row.category : 'other';
    summary[cat].amount += row.amount;
    summary[cat].co2    += row.co2kg;
    summary[cat].count  += 1;
    totalAmount += row.amount;
    totalCO2    += row.co2kg;
  }
  const payload = { rows, summary, totalAmount, totalCO2, analyzedAt: new Date().toISOString() };
  try { localStorage.setItem('greenlens_analysis', JSON.stringify(payload)); } catch {}
}

// ────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsText(file);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showLoading(msg) {
  loadingStatus.textContent = msg || 'Processing…';
  loadingOverlay.classList.add('is-active');
}
function setLoadingStatus(msg) { loadingStatus.textContent = msg; }
function hideLoading() { loadingOverlay.classList.remove('is-active'); }

function showError(msg, showRetry = false) {
  errorText.textContent = msg;
  retryRulesOnly.hidden = !showRetry;
  uploadError.hidden = false;
}
function hideError() { uploadError.hidden = true; }

function formatCurrency(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCO2(kg) {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + ' t';
  return kg.toFixed(1) + ' kg';
}
function confidenceLabel(c) {
  if (c === 'rule') return 'Matched';
  if (c === 'high') return 'High';
  if (c === 'medium') return 'Medium';
  return 'Low';
}
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
