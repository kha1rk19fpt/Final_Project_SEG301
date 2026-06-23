/**
 * WikiSearch – app.js
 * Connects to FastAPI backend at http://127.0.0.1:8000
 */

const API_BASE = 'http://127.0.0.1:8000';

// ── marked.js config ─────────────────────────────────────────────────────────
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
  });
}

function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text || ''); }
    catch { return escapeHtml(text); }
  }
  return escapeHtml(text);
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── DOM References ────────────────────────────────────────────────────────────
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const topKSelect = document.getElementById('topKSelect');
const searchBtn = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');

const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const metaQuery = document.getElementById('metaQuery');
const metaTime = document.getElementById('metaTime');

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const errorDesc = document.getElementById('errorDesc');
const retryBtn = document.getElementById('retryBtn');
const emptyState = document.getElementById('emptyState');
const resultsList = document.getElementById('resultsList');
const cardTemplate = document.getElementById('resultCardTemplate');

// ── State ─────────────────────────────────────────────────────────────────────
let lastQuery = '';
let lastK = 5;

// ── Event Listeners ───────────────────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) { searchInput.focus(); return; }
  runSearch(q, parseInt(topKSelect.value, 10));
});

retryBtn.addEventListener('click', () => {
  if (lastQuery) runSearch(lastQuery, lastK);
});

// Suggestion pills
suggestions.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  const q = pill.dataset.query;
  searchInput.value = q;
  runSearch(q, parseInt(topKSelect.value, 10));
});

// Keyboard shortcut: Ctrl+K / Cmd+K to focus search
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  // Escape to clear input
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
  }
});

// ── Core Search Function ──────────────────────────────────────────────────────
async function runSearch(query, k) {
  lastQuery = query;
  lastK = k;

  setVisible(loadingState, true);
  setVisible(statusBar, false);
  setVisible(errorState, false);
  setVisible(emptyState, false);
  resultsList.innerHTML = '';
  searchBtn.disabled = true;

  document.getElementById('resultsSection')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const url = `${API_BASE}/search?q=${encodeURIComponent(query)}&k=${k}`;
    const res = await fetch(url);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    renderResults(data);

  } catch (err) {
    showError(err.message || 'Cannot connect to backend. Make sure uvicorn is running on port 8000.');
  } finally {
    setVisible(loadingState, false);
    searchBtn.disabled = false;
  }
}

// ── Render Results ────────────────────────────────────────────────────────────
function renderResults(data) {
  const {
    optimized_search_keyword,
    processing_time_ms,
    total_results,
    data: articles,
  } = data;

  statusText.textContent = `${total_results} result${total_results !== 1 ? 's' : ''} found`;
  metaQuery.textContent = `🔍 "${optimized_search_keyword}"`;
  metaTime.textContent = `⚡ ${processing_time_ms} ms`;
  setVisible(statusBar, true);

  if (!articles || articles.length === 0) {
    setVisible(emptyState, true);
    return;
  }

  // Score range → relative bar widths
  const scores = articles.map(a => a.weighted_score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  articles.forEach((article, idx) => {
    const card = buildCard(article, idx, minScore, maxScore);
    resultsList.appendChild(card);
  });
}

// ── Build a Single Result Card ────────────────────────────────────────────────
function buildCard(article, idx, minScore, maxScore) {
  const {
    rank, title, url, content,
    weighted_score, best_chunk_score, avg_chunk_score,
    matched_chunks, text_source,
  } = article;

  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.result-card');

  // Stagger animation delay
  card.style.animationDelay = `${idx * 0.07}s`;

  // Rank badge
  card.querySelector('.rank-badge').textContent = `#${rank}`;

  // Title & URL
  card.querySelector('.card-title').textContent = title || 'Untitled';
  const urlEl = card.querySelector('.card-url');
  urlEl.href = url;
  urlEl.textContent = truncateUrl(url, 55);
  urlEl.title = url;

  // Source badge (full_article vs merged_chunks)
  const sourceBadge = card.querySelector('.source-badge');
  if (text_source === 'full_article') {
    sourceBadge.textContent = '✓ Full article';
    sourceBadge.classList.add('source-full');
  } else {
    sourceBadge.textContent = '⚡ Merged chunks';
    sourceBadge.classList.add('source-merged');
  }

  // Content preview — plain text, 3 lines
  const preview = card.querySelector('.content-preview');
  // Strip markdown symbols for cleaner preview
  const plainPreview = (content || '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .trim();
  preview.textContent = plainPreview
    ? plainPreview.slice(0, 320) + (plainPreview.length > 320 ? '…' : '')
    : 'No content available.';

  // Scores
  card.querySelector('.weighted-score-val').textContent = 
      weighted_score   != null ? weighted_score.toFixed(4)   : 'N/A';
  card.querySelector('.best-score-val').textContent     = 
      best_chunk_score != null ? best_chunk_score.toFixed(4) : 'N/A';
  card.querySelector('.avg-score-val').textContent      = 
      avg_chunk_score  != null ? avg_chunk_score.toFixed(4)  : 'N/A';
  card.querySelector('.chunks-val').textContent = matched_chunks;

  // Score color coding on score-value elements
  colorScore(card.querySelector('.weighted-score-val'), weighted_score);
  colorScore(card.querySelector('.best-score-val'), best_chunk_score);
  colorScore(card.querySelector('.avg-score-val'), avg_chunk_score);

  // Score bars (invert: lower = more fill)
  const range = maxScore - minScore || 1;
  const relFill = (score) => {
    const pct = 100 - ((score - minScore) / range) * 80;
    return Math.max(10, Math.min(100, pct));
  };
  if (weighted_score   != null) animateFill(card.querySelector('.weighted-fill'), relFill(weighted_score));
  if (best_chunk_score != null) animateFill(card.querySelector('.best-fill'),     relFill(best_chunk_score));
  if (avg_chunk_score  != null) animateFill(card.querySelector('.avg-fill'),      relFill(avg_chunk_score));

  // ── Expand / Collapse ──
  const expandBtn = card.querySelector('.expand-btn');
  const cardExpanded = card.querySelector('.card-expanded');
  const renderedPane = card.querySelector('[data-view="rendered"]');
  const rawPane = card.querySelector('[data-view="raw"]');
  const textSourceBadge = card.querySelector('.text-source-badge');
  const wikiBtn = card.querySelector('.open-wiki-btn');
  const tabs = card.querySelectorAll('.expand-tab');

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.tab;
      setVisible(renderedPane, view === 'rendered');
      setVisible(rawPane, view === 'raw');
    });
  });

  expandBtn.addEventListener('click', () => {
    const isExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
    expandBtn.setAttribute('aria-expanded', String(!isExpanded));
    expandBtn.classList.toggle('active', !isExpanded);

    if (!isExpanded) {
      // Populate on first open
      if (!renderedPane.dataset.loaded) {
        renderedPane.innerHTML = renderMarkdown(content || 'No content available.');
        rawPane.textContent = content || 'No content available.';
        renderedPane.dataset.loaded = '1';
      }
      wikiBtn.href = url;

      // Text source badge in footer
      textSourceBadge.textContent = text_source === 'full_article'
        ? '📄 Full article from JSON'
        : '🔗 Merged from matched chunks';
      textSourceBadge.className = 'text-source-badge ' +
        (text_source === 'full_article' ? 'source-full' : 'source-merged');

      setVisible(cardExpanded, true);
    } else {
      setVisible(cardExpanded, false);
    }
  });

  return frag;
}

// ── Score color helper ────────────────────────────────────────────────────────
// Lower score = more relevant = green, higher = red
function colorScore(el, score) {
  if (!el) return;
  el.classList.remove('score-good', 'score-mid', 'score-bad');
  if (score < 0.35) el.classList.add('score-good');
  else if (score < 0.60) el.classList.add('score-mid');
  else el.classList.add('score-bad');
}

// ── Error State ───────────────────────────────────────────────────────────────
function showError(message) {
  errorDesc.textContent = message;
  setVisible(errorState, true);
  setVisible(loadingState, false);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setVisible(el, visible) {
  el.hidden = !visible;
}

function truncateUrl(url, maxLen) {
  try {
    const u = new URL(url);
    const short = u.hostname + u.pathname;
    return short.length > maxLen ? short.slice(0, maxLen) + '…' : short;
  } catch {
    return url.length > maxLen ? url.slice(0, maxLen) + '…' : url;
  }
}

function animateFill(el, pct) {
  el.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { el.style.width = pct + '%'; }, 80);
  });
}