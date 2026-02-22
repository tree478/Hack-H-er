/* ============================================================
   GreenPromise — Upload & Analysis Engine
   ============================================================ */

// ── PDF.js worker setup
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Emission Factors (kg CO₂ per USD spent, sourced from EPA/EEIO)
const EMISSION_FACTORS = {
  energy:     0.233,
  transport:  0.181,
  supply:     0.142,
  waste:      0.098,
  other:      0.120,
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
    'packaging','raw material','raw materials','office supplies',
    'lumber','timber','steel','aluminum','copper','plastic','resin',
    'fabric','textile','cardboard',
    'wholesale','distributor',
    'food supplier','wholesale food','sysco','us foods','gordon food',
    'printing','print shop','manufacturing',
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
const dropZone           = document.getElementById('dropZone');
const uploadBoxInner     = document.getElementById('uploadBoxInner');
const fileInput          = document.getElementById('fileInput');
const fileQueue          = document.getElementById('fileQueue');
const fileList           = document.getElementById('fileList');
const fileQueueCount     = document.getElementById('fileQueueCount');
const clearQueueBtn      = document.getElementById('clearQueueBtn');
const analyzeBtn         = document.getElementById('analyzeBtn');
const uploadError        = document.getElementById('uploadError');
const errorText          = document.getElementById('errorText');
const retryRulesOnly     = document.getElementById('retryRulesOnly');
const loadingOverlay     = document.getElementById('loadingOverlay');
const loadingStatus      = document.getElementById('loadingStatus');
const resultsSection     = document.getElementById('resultsSection');
const summaryCards       = document.getElementById('summaryCards');
const emissionsNarrative = document.getElementById('emissionsNarrative');
const resultsTableBody   = document.getElementById('resultsTableBody');
const tableCount         = document.getElementById('tableCount');
const viewOutcomesBtn    = document.getElementById('viewOutcomesBtn');
const resetBtn           = document.getElementById('resetBtn');

let selectedFiles = [];
let parsedRows    = [];

// ── Drag & Drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

// ── Browse button (supports multiple)
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = ''; // reset so same file can be re-added after removal
});

// ── Clear all / Analyze / Retry / Reset
clearQueueBtn.addEventListener('click', clearAllFiles);
analyzeBtn.addEventListener('click', () => runAnalysis(false));
retryRulesOnly.addEventListener('click', () => runAnalysis(true));
resetBtn.addEventListener('click', () => {
  resultsSection.hidden = true;
  clearAllFiles();
  hideError();
  try { localStorage.removeItem('greenpromise_analysis'); } catch {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Restore previous results on page load
(function restoreFromLocalStorage() {
  try {
    const saved = localStorage.getItem('greenpromise_analysis');
    if (!saved) return;
    const data = JSON.parse(saved);
    if (!data.rows || data.rows.length === 0) return;
    parsedRows = data.rows;
    renderResults(data.rows);
    resultsSection.hidden = false;
  } catch {}
})();

// ────────────────────────────────────────────
// FILE QUEUE MANAGEMENT
// ────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = ['.csv', '.pdf', '.jpg', '.jpeg', '.png', '.webp'];

function addFiles(fileListInput) {
  let added = 0;
  for (const file of fileListInput) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      showError(`"${file.name}" is not supported. Please use CSV, PDF, JPG, or PNG.`);
      continue;
    }
    // Skip duplicates
    if (selectedFiles.find(f => f.name === file.name && f.size === file.size)) continue;
    selectedFiles.push(file);
    added++;
  }
  if (added > 0) {
    hideError();
    renderFileQueue();
    analyzeBtn.disabled = false;
  }
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileQueue();
  analyzeBtn.disabled = selectedFiles.length === 0;
}

function clearAllFiles() {
  selectedFiles = [];
  renderFileQueue();
  analyzeBtn.disabled = true;
}

function renderFileQueue() {
  if (selectedFiles.length === 0) {
    fileQueue.hidden = true;
    uploadBoxInner.hidden = false;
    return;
  }
  uploadBoxInner.hidden = true;
  fileQueue.hidden = false;
  fileQueueCount.textContent =
    `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} queued`;

  fileList.innerHTML = selectedFiles.map((file, i) => `
    <li class="file-item" id="file-item-${i}">
      <div class="file-item-icon">${getFileTypeIcon(file.name)}</div>
      <div class="file-item-info">
        <span class="file-item-name">${escapeHtml(file.name)}</span>
        ${getFileTypeBadge(file.name)}
      </div>
      <span class="file-item-status file-item-status--waiting" id="file-status-${i}">Waiting</span>
      <button class="file-item-remove" onclick="removeFile(${i})" title="Remove">
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="#7a6452" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    </li>`).join('');
}

function updateFileStatus(index, status, message) {
  const el = document.getElementById(`file-status-${index}`);
  if (!el) return;
  el.className = `file-item-status file-item-status--${status}`;
  const labels = { waiting: 'Waiting', parsing: 'Parsing…', done: 'Done ✓', error: 'Error' };
  el.textContent = (status === 'error' && message)
    ? 'Error: ' + message.substring(0, 28)
    : (labels[status] || status);
  if (status === 'error' && message) el.title = message;
}

function getFileTypeIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    return `<svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="14" height="18" rx="2" stroke="#4a7c59" stroke-width="1.6"/>
      <path d="M12 2v5h5" stroke="#4a7c59" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M6 11h8M6 14h5" stroke="#4a7c59" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`;
  }
  if (ext === 'pdf') {
    return `<svg viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="14" height="18" rx="2" stroke="#d4867e" stroke-width="1.6"/>
      <path d="M12 2v5h5" stroke="#d4867e" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M6 10h8M6 13h6M6 16h4" stroke="#d4867e" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#a08b76" stroke-width="1.6"/>
    <circle cx="8.5" cy="8.5" r="1.5" fill="#a08b76"/>
    <path d="M3 15l5-4 4 4 3-3 6 5" stroke="#a08b76" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function getFileTypeBadge(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'csv') return '<span class="ftype-badge ftype-badge--csv">CSV</span>';
  if (ext === 'pdf') return '<span class="ftype-badge ftype-badge--pdf">PDF</span>';
  return '<span class="ftype-badge ftype-badge--img">Image</span>';
}

// ────────────────────────────────────────────
// CSV PARSER
// ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV must have at least a header row and one data row.');

  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

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
// PDF PARSER (PDF.js)
// ────────────────────────────────────────────
async function parsePDF(file) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js library failed to load. Please refresh and try again.');
  }

  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }

  // Scanned PDFs produce very little extractable text
  if (fullText.replace(/\s/g, '').length < 40) {
    throw new Error(
      'This PDF appears to be a scanned image. Save it as a JPG/PNG and re-upload to use the image parser.'
    );
  }

  // Prefer AI extraction — it returns proper categories and handles any PDF layout.
  // Fall back to regex only if there are no API keys at all.
  if (getGeminiKey() || getAnthropicKey()) {
    return await aiExtractFromText(fullText);
  }

  // No API keys: try regex parsing as a last resort
  const rows = extractRowsFromText(fullText);
  if (rows.length === 0) {
    throw new Error('No expense line items found in this PDF. Add an API key to config.js for better parsing.');
  }
  return rows;
}

function extractRowsFromText(text) {
  const rows = [];
  const lines = text.split(/\n/);

  const dollarPattern  = /\$\s*(\d{1,6}(?:,\d{3})*(?:\.\d{2})?)/;
  const numericPattern = /\b(\d{1,6}(?:,\d{3})*\.\d{2})\b/;
  const datePattern    = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;

    let amountStr = null;
    let amount = 0;

    const dollarMatch = trimmed.match(dollarPattern);
    if (dollarMatch) {
      amountStr = dollarMatch[0];
      amount = parseFloat(dollarMatch[1].replace(/,/g, ''));
    } else {
      const numMatch = trimmed.match(numericPattern);
      if (numMatch) {
        amountStr = numMatch[0];
        amount = parseFloat(numMatch[1].replace(/,/g, ''));
      }
    }

    if (!amount || amount <= 0 || amount > 500000) continue;

    const dateMatch = trimmed.match(datePattern);
    const date = dateMatch ? dateMatch[0] : '';

    // Vendor = line with amount and date removed, cleaned up
    let vendor = trimmed
      .replace(amountStr, '')
      .replace(date, '')
      .replace(/[,$]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Strip common non-vendor prefixes
    vendor = vendor.replace(/^(total|subtotal|balance|tax|tip|due|amount|payment|charge|fee|credit|debit)\b\s*/i, '').trim();

    if (!vendor || vendor.length < 2) continue;

    rows.push({
      vendor:      vendor.substring(0, 80),
      description: vendor.substring(0, 80),
      amount,
      date,
      raw: [trimmed],
    });
  }

  return rows;
}

// ────────────────────────────────────────────
// SHARED PROMPTS & HELPERS
// ────────────────────────────────────────────
const PDF_SYSTEM_PROMPT = `You are a sustainability data extractor. Given text from any business document (sustainability report, expense table, invoice, financial statement), extract every emission or expense line item.

For each item return a JSON object with:
- vendor: the category, company, or item name (string)
- description: a brief description of the item (string)
- amount: the cost in USD (number, 0 if no dollar value given)
- co2_kg: the CO₂ equivalent in kilograms (number; convert tonnes → kg by × 1000; 0 if not given)
- category: exactly one of: energy, transport, supply, waste, or other
  - energy: electricity, gas utilities, power companies, solar, HVAC, lighting
  - transport: fuel, shipping carriers, freight, flights, vehicle costs, delivery
  - supply: raw materials, office supplies, packaging, manufacturing inputs
  - waste: waste disposal, recycling, sanitation, cleaning
  - other: anything that does not clearly fit above
- confidence: high, medium, or low
- date: date string if present, otherwise ""

Return ONLY a valid JSON array. No markdown, no explanation, just the raw JSON array.`;

const IMAGE_SYSTEM_PROMPT = `You are a receipt and invoice parser. Extract all expense line items from the image provided. Return ONLY a valid JSON array. Each element must have: vendor (string), description (string), amount (number in USD, positive), date (string, empty if not visible), category (exactly one of: energy, transport, supply, waste, or other — energy = electricity/gas utilities/power; transport = fuel/shipping/freight/delivery; supply = materials/office supplies/packaging; waste = disposal/recycling/sanitation; other = anything else), confidence (high/medium/low). No explanations, no markdown — only the raw JSON array.`;

const VALID_CATEGORIES = ['energy', 'transport', 'supply', 'waste', 'other'];

function getGeminiKey() {
  const k = (typeof GEMINI_API_KEY !== 'undefined') ? GEMINI_API_KEY.trim() : null;
  return (k && k !== 'your-gemini-key-here') ? k : null;
}
function getAnthropicKey() {
  const k = (typeof ANTHROPIC_API_KEY !== 'undefined') ? ANTHROPIC_API_KEY.trim() : null;
  return (k && k !== 'your-api-key-here') ? k : null;
}

function parseJsonArray(text) {
  let cleaned = text.trim();
  // Strip markdown code fences that Gemini sometimes wraps around JSON
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const match = cleaned.match(/\[[\s\S]*\]/);
  return JSON.parse(match ? match[0] : cleaned);
}

function normalizePdfRows(items) {
  const rows = items
    .filter(item => item.vendor || item.description)
    .map(item => {
      const co2kg  = Math.abs(parseFloat(item.co2_kg) || 0);
      const amount = Math.abs(parseFloat(item.amount) || 0);
      const rawCat = String(item.category || '').toLowerCase().trim();
      return {
        vendor:      String(item.vendor      || '').trim().substring(0, 80),
        description: String(item.description || item.vendor || '').trim().substring(0, 80),
        amount,
        date:        String(item.date || '').trim(),
        co2kg,
        directCo2:   co2kg > 0,
        category:    VALID_CATEGORIES.includes(rawCat) ? rawCat : null,
        confidence:  item.confidence || 'medium',
        raw:         [],
      };
    });
  if (rows.length === 0) throw new Error('No recognizable data found. Ensure the file contains emission or expense information.');
  return rows;
}

function normalizeImageRows(items) {
  const rows = items
    .filter(item => parseFloat(item.amount) > 0)
    .map(item => {
      const rawCat = String(item.category || '').toLowerCase().trim();
      return {
        vendor:      String(item.vendor      || '').trim().substring(0, 80),
        description: String(item.description || item.vendor || '').trim().substring(0, 80),
        amount:      Math.abs(parseFloat(item.amount) || 0),
        date:        String(item.date || '').trim(),
        category:    VALID_CATEGORIES.includes(rawCat) ? rawCat : null,
        confidence:  item.confidence || 'medium',
        raw:         [],
      };
    });
  if (rows.length === 0) throw new Error('No expense items found. Ensure the file shows a receipt or financial document.');
  return rows;
}

// ────────────────────────────────────────────
// GEMINI API HELPERS
// ────────────────────────────────────────────
async function geminiExtractFromText(text, geminiKey) {
  const excerpt = text.length > 6000 ? text.substring(0, 6000) + '\n[truncated]' : text;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PDF_SYSTEM_PROMPT }] },
        contents: [{
          parts: [{ text: `Extract all emission and expense items from this document:\n\n${excerpt}` }],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini PDF error (${response.status}): ${err}`);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Gemini returned an unexpected response format for PDF extraction.');
  }
  const rawText = data.candidates[0].content.parts[0].text;
  return normalizePdfRows(parseJsonArray(rawText));
}

async function geminiExtractFromImage(base64, mediaType, geminiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: IMAGE_SYSTEM_PROMPT }] },
        contents: [{
          parts: [
            { inlineData: { mimeType: mediaType, data: base64 } },
            { text: 'Extract all expense line items from this receipt or document.' },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini Vision error (${response.status}): ${err}`);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Gemini returned an unexpected response format for image extraction.');
  }
  const rawText = data.candidates[0].content.parts[0].text;
  return normalizeImageRows(parseJsonArray(rawText));
}

// ────────────────────────────────────────────
// CLAUDE API HELPERS (fallback)
// ────────────────────────────────────────────
async function claudeExtractFromText(text, anthropicKey) {
  const excerpt = text.length > 6000 ? text.substring(0, 6000) + '\n[truncated]' : text;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system: PDF_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Extract all emission and expense items from this document:\n\n${excerpt}`,
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude PDF error (${response.status}): ${err}`);
  }

  const data    = await response.json();
  const rawText = data.content[0].text.trim();
  return normalizePdfRows(parseJsonArray(rawText));
}

async function claudeExtractFromImage(base64, mediaType, anthropicKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system: IMAGE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Extract all expense line items from this receipt or document.' },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude Vision error (${response.status}): ${err}`);
  }

  const data    = await response.json();
  const rawText = data.content[0].text.trim();
  return normalizeImageRows(parseJsonArray(rawText));
}

// ────────────────────────────────────────────
// AI TEXT EXTRACTOR — PDF (Claude primary, Gemini fallback)
// ────────────────────────────────────────────
async function aiExtractFromText(text) {
  const geminiKey    = getGeminiKey();
  const anthropicKey = getAnthropicKey();

  if (!anthropicKey && !geminiKey) {
    throw new Error('An API key is required to parse this PDF. Add your Anthropic key to config.js.');
  }

  if (anthropicKey) {
    try {
      return await claudeExtractFromText(text, anthropicKey);
    } catch (claudeErr) {
      console.warn('Claude PDF extraction failed, trying Gemini fallback:', claudeErr.message);
      if (geminiKey) {
        return await geminiExtractFromText(text, geminiKey);
      }
      throw claudeErr;
    }
  }

  return await geminiExtractFromText(text, geminiKey);
}

// ────────────────────────────────────────────
// IMAGE / RECEIPT PARSER (Claude primary, Gemini fallback)
// ────────────────────────────────────────────
async function parseImage(file) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`"${file.name}" is too large (max 5 MB). Please compress the image and try again.`);
  }

  const geminiKey    = getGeminiKey();
  const anthropicKey = getAnthropicKey();

  if (!anthropicKey && !geminiKey) {
    throw new Error('An API key is required to parse images. Add your Anthropic key to config.js.');
  }

  const base64    = await readFileAsBase64(file);
  const mediaType = file.type || 'image/jpeg';

  if (anthropicKey) {
    try {
      return await claudeExtractFromImage(base64, mediaType, anthropicKey);
    } catch (claudeErr) {
      console.warn('Claude image parsing failed, trying Gemini fallback:', claudeErr.message);
      if (geminiKey) {
        return await geminiExtractFromImage(base64, mediaType, geminiKey);
      }
      throw claudeErr;
    }
  }

  return await geminiExtractFromImage(base64, mediaType, geminiKey);
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
// AI CATEGORIZER (Claude primary, Gemini fallback)
// ────────────────────────────────────────────
const CATEGORIZE_SYSTEM_PROMPT = `You are a sustainability analyst helping categorize business expenses by emission type.
For each expense, assign exactly one category from: energy, transport, supply, waste, or other.
- energy: electricity bills, gas utilities, power companies, solar, HVAC
- transport: fuel, shipping carriers, freight, flights, vehicle rentals, couriers
- supply: raw materials, office supplies, manufacturing inputs, packaging, wholesale goods
- waste: waste disposal, recycling services, sanitation, cleaning
- other: anything that doesn't clearly fit above
Return ONLY a valid JSON array. Each element must have: index (number), category (string), confidence (high/medium/low).
No extra text, no markdown, just the raw JSON array.`;

async function aiCategorize(unknownRows) {
  const geminiKey    = getGeminiKey();
  const anthropicKey = getAnthropicKey();

  if (!anthropicKey && !geminiKey) {
    return unknownRows.map(r => ({ ...r, category: 'other', confidence: 'low' }));
  }

  const payload = unknownRows
    .map((r, i) => `${i + 1}. Vendor: "${r.vendor}" | Description: "${r.description}" | Amount: $${r.amount.toFixed(2)}`)
    .join('\n');
  const userMsg = `Categorize these business expenses:\n${payload}`;

  // Try Claude first
  if (anthropicKey) {
    try {
      return await claudeCategorize(unknownRows, userMsg, anthropicKey);
    } catch (claudeErr) {
      console.warn('Claude categorization failed, trying Gemini fallback:', claudeErr.message);
      if (geminiKey) {
        return await geminiCategorize(unknownRows, userMsg, geminiKey);
      }
      throw claudeErr;
    }
  }

  return await geminiCategorize(unknownRows, userMsg, geminiKey);
}

async function geminiCategorize(unknownRows, userMsg, geminiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CATEGORIZE_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userMsg }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini categorization error (${response.status}): ${err}`);
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Gemini returned an unexpected response format for categorization.');
  }
  const rawText = data.candidates[0].content.parts[0].text;
  const parsed  = parseJsonArray(rawText);

  return unknownRows.map((row, i) => {
    const aiResult = parsed.find(p => p.index === i + 1);
    return {
      ...row,
      category:   aiResult ? aiResult.category.toLowerCase().trim() : 'other',
      confidence: aiResult ? aiResult.confidence : 'low',
    };
  });
}

async function claudeCategorize(unknownRows, userMsg, anthropicKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system: CATEGORIZE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude categorization error (${response.status}): ${err}`);
  }

  const data    = await response.json();
  const rawText = data.content[0].text.trim();
  const parsed  = parseJsonArray(rawText);

  return unknownRows.map((row, i) => {
    const aiResult = parsed.find(p => p.index === i + 1);
    return {
      ...row,
      category:   aiResult ? aiResult.category.toLowerCase().trim() : 'other',
      confidence: aiResult ? aiResult.confidence : 'low',
    };
  });
}

// ────────────────────────────────────────────
// MAIN ANALYSIS PIPELINE
// ────────────────────────────────────────────
async function runAnalysis(rulesOnly = false) {
  if (selectedFiles.length === 0) return;
  hideError();
  resultsSection.hidden = true;

  const total = selectedFiles.length;
  showLoading(`Processing ${total} file${total > 1 ? 's' : ''}…`);

  const allRawRows = [];

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const ext  = file.name.split('.').pop().toLowerCase();

    updateFileStatus(i, 'parsing');
    setLoadingStatus(`Parsing "${file.name}" (${i + 1} of ${total})…`);

    try {
      let rows = [];
      if (ext === 'csv') {
        rows = parseCSV(await readFileAsText(file));
      } else if (ext === 'pdf') {
        rows = await parsePDF(file);
      } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        rows = await parseImage(file);
      }
      allRawRows.push(...rows);
      updateFileStatus(i, 'done');
    } catch (e) {
      console.error(`Error processing "${file.name}":`, e.message);
      updateFileStatus(i, 'error', e.message);
    }
  }

  if (allRawRows.length === 0) {
    hideLoading();
    // Collect per-file error details to show a helpful message
    const errorEls = document.querySelectorAll('.file-item-status--error');
    const errorHints = [];
    errorEls.forEach(el => { if (el.title) errorHints.push(el.title); });
    const detail = errorHints.length > 0 ? ' Error: ' + errorHints[0] : '';
    showError('No valid expense data could be extracted from the uploaded files.' + detail);
    return;
  }

  setLoadingStatus('Categorizing expenses…');

  const categorized = [];
  const needsAI     = [];

  for (const row of allRawRows) {
    // Rows that already have a category from AI extraction (PDF/image parsers) skip rule matching
    if (row.category) {
      categorized.push({
        ...row,
        confidence: row.confidence || 'medium',
      });
      continue;
    }
    // Rule-based first pass for CSV rows and uncategorized rows
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

  // Add CO₂ estimates — preserve values extracted directly from reports
  const finalRows = categorized.map(row => ({
    ...row,
    co2kg: (row.directCo2 && row.co2kg > 0)
      ? +row.co2kg.toFixed(2)
      : +(row.amount * (EMISSION_FACTORS[row.category] || EMISSION_FACTORS.other)).toFixed(2),
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

  document.getElementById('resultsSummaryText').textContent =
    `Analyzed ${rows.length} expense${rows.length !== 1 ? 's' : ''} totaling ${formatCurrency(totalAmount)} — estimated ${formatCO2(totalCO2)} of CO₂ equivalent.`;

  summaryCards.innerHTML = '';
  for (const [catKey, meta] of Object.entries(CATEGORIES)) {
    const d = byCategory[catKey];
    if (d.count === 0) continue;
    const co2Pct   = totalCO2    > 0 ? Math.round((d.co2    / totalCO2)    * 100) : 0;
    const spendPct = totalAmount > 0 ? Math.round((d.amount / totalAmount) * 100) : 0;
    summaryCards.innerHTML += `
      <div class="summary-card summary-card--${meta.color}">
        <div class="summary-card-icon">${meta.emoji}</div>
        <div class="summary-card-body">
          <p class="summary-cat-label">${meta.label}</p>
          <p class="summary-amount">${formatCurrency(d.amount)}</p>
          <p class="summary-pct">${spendPct}% of spend &nbsp;·&nbsp; <strong>${co2Pct}% of CO₂</strong></p>
          <p class="summary-co2">${formatCO2(d.co2)} CO₂e</p>
        </div>
        <div class="summary-bar-wrap">
          <div class="summary-bar" style="width:${co2Pct}%"></div>
        </div>
      </div>`;
  }

  const topCat  = Object.entries(byCategory).sort((a, b) => b[1].co2 - a[1].co2)[0];
  const topMeta = CATEGORIES[topCat[0]];
  emissionsNarrative.innerHTML = buildNarrative(rows, byCategory, totalAmount, totalCO2, topCat[0], topMeta);

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
  try { localStorage.setItem('greenpromise_analysis', JSON.stringify(payload)); } catch {}
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

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsDataURL(file);
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
  if (c === 'rule')   return 'Matched';
  if (c === 'high')   return 'High';
  if (c === 'medium') return 'Medium';
  return 'Low';
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
