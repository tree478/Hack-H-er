/* =============================================
   GreenPromise — auth.js
   Authentication & History Management
   (localStorage-backed, frontend-only)
   ============================================= */

const GL_USERS_KEY   = 'greenlens_users';
const GL_CURRENT_KEY = 'greenlens_current_user';
const GL_PENDING_KEY = 'greenlens_pending_user';
const GL_HISTORY_KEY = 'greenlens_history';

/* ── Storage helpers ───────────────────────── */
function _getUsers() {
  try { return JSON.parse(localStorage.getItem(GL_USERS_KEY) || '{}'); }
  catch { return {}; }
}

function _saveUsers(users) {
  localStorage.setItem(GL_USERS_KEY, JSON.stringify(users));
}

/* ── Public API ────────────────────────────── */

function glGetCurrentUser() {
  try { return JSON.parse(localStorage.getItem(GL_CURRENT_KEY) || 'null'); }
  catch { return null; }
}

function glSignup(formData) {
  const { companyName, phone, email, username, password } = formData;
  if (!companyName || !phone || !email || !username || !password)
    return { ok: false, error: 'All fields are required.' };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email))
    return { ok: false, error: 'Please enter a valid email address.' };

  if (password.length < 6)
    return { ok: false, error: 'Password must be at least 6 characters.' };

  const users = _getUsers();
  const key   = username.toLowerCase().trim();

  if (users[key])
    return { ok: false, error: 'That username is already taken. Please choose another.' };

  const emailTaken = Object.values(users).some(
    u => u.email.toLowerCase() === email.toLowerCase()
  );
  if (emailTaken)
    return { ok: false, error: 'An account with that email already exists. Try logging in.' };

  const user = {
    companyName: companyName.trim(),
    phone:       phone.trim(),
    email:       email.toLowerCase().trim(),
    username:    key,
    password,
    agreedToTerms: false,
    createdAt:   new Date().toISOString(),
  };

  users[key] = user;
  _saveUsers(users);
  localStorage.setItem(GL_PENDING_KEY, JSON.stringify(user));
  return { ok: true, user };
}

function glAgreeToTerms() {
  const pending = JSON.parse(localStorage.getItem(GL_PENDING_KEY) || 'null');
  if (!pending) return false;

  const users = _getUsers();
  pending.agreedToTerms = true;
  users[pending.username] = pending;
  _saveUsers(users);
  localStorage.setItem(GL_CURRENT_KEY, JSON.stringify(pending));
  localStorage.removeItem(GL_PENDING_KEY);
  return true;
}

function glDeclineTerms() {
  const pending = JSON.parse(localStorage.getItem(GL_PENDING_KEY) || 'null');
  if (pending) {
    const users = _getUsers();
    delete users[pending.username];
    _saveUsers(users);
    localStorage.removeItem(GL_PENDING_KEY);
  }
}

function glLogin(username, password) {
  const users = _getUsers();
  const user  = users[username.toLowerCase().trim()];

  if (!user)
    return { ok: false, error: 'No account found with that username.' };
  if (user.password !== password)
    return { ok: false, error: 'Incorrect password. Please try again.' };
  if (!user.agreedToTerms)
    return { ok: false, error: 'Please complete your registration by agreeing to our Terms & Privacy Policy.' };

  localStorage.setItem(GL_CURRENT_KEY, JSON.stringify(user));
  return { ok: true, user };
}

function glLogout() {
  localStorage.removeItem(GL_CURRENT_KEY);
}

/* ── History ───────────────────────────────── */

function glSaveAnalysis(scoreValue, analysisData) {
  const user = glGetCurrentUser();
  if (!user) return false;

  try {
    const all     = JSON.parse(localStorage.getItem(GL_HISTORY_KEY) || '{}');
    const entries = all[user.username] || [];
    const now     = Date.now();

    // Deduplicate: skip if identical score was saved in the last 2 minutes
    const recent = entries.find(e => e.score === scoreValue &&
      (now - new Date(e.savedAt).getTime()) < 120_000);
    if (recent) return true;

    entries.unshift({
      id:          now,
      savedAt:     new Date().toISOString(),
      score:       scoreValue,
      companyName: user.companyName,
      analysis:    analysisData,
    });

    all[user.username] = entries.slice(0, 25); // keep last 25 entries
    localStorage.setItem(GL_HISTORY_KEY, JSON.stringify(all));
    return true;
  } catch { return false; }
}

function glGetHistory() {
  const user = glGetCurrentUser();
  if (!user) return [];
  try {
    const all = JSON.parse(localStorage.getItem(GL_HISTORY_KEY) || '{}');
    return all[user.username] || [];
  } catch { return []; }
}

function glRestoreAnalysis(entry) {
  if (!entry || !entry.analysis) return false;
  localStorage.setItem('greenlens_analysis', JSON.stringify(entry.analysis));
  return true;
}

/* ── Nav auth button update ─────────────────── */
/*
 * Every page hard-codes a <a class="nav-auth-btn"> as its rightmost
 * nav link (defaults to "Join the Green"). We update it here once the
 * DOM is available — no injection, no innerHTML, just attribute changes.
 */

function glUpdateNav() {
  const user      = glGetCurrentUser();
  const path      = window.location.pathname;
  const isHistory = path.includes('history.html');
  const isJoin    = path.includes('join.html');

  document.querySelectorAll('.nav-auth-btn').forEach(btn => {
    if (user) {
      btn.textContent = 'Profile';
      btn.href        = 'history.html';
      btn.classList.add('nav-btn--join');
      btn.classList.toggle('nav-btn--active', isHistory);
    } else {
      btn.textContent = 'Join the Green';
      btn.href        = 'join.html';
      btn.classList.add('nav-btn--join');
      btn.classList.toggle('nav-btn--active', isJoin);
    }
  });
}

/* Run immediately — the button is already in the DOM (hardcoded HTML),
   so no need to wait for DOMContentLoaded. */
glUpdateNav();
