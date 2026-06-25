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
    rank, title, url, content, text_source,
    final_rrf_score, l2_score, bm25_score, matched_chunks
  } = article;

  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.result-card');

  card.style.animationDelay = `${idx * 0.07}s`;
  card.querySelector('.rank-badge').textContent = `#${rank}`;
  card.querySelector('.card-title').textContent = title || 'Untitled';
  
  const urlEl = card.querySelector('.card-url');
  urlEl.href = url;
  urlEl.textContent = truncateUrl(url, 55);
  urlEl.title = url;

  const sourceBadge = card.querySelector('.source-badge');
  if (text_source === 'full_article' || text_source === 'bm25_only') {
    sourceBadge.textContent = '✓ Full article';
    sourceBadge.classList.add('source-full');
  } else {
    sourceBadge.textContent = '⚡ Merged chunks';
    sourceBadge.classList.add('source-merged');
  }

  const preview = card.querySelector('.content-preview');
  const plainPreview = (content || '')
    .replace(/#{1,6}\s/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{2,}/g, ' ').trim();
  preview.textContent = plainPreview
    ? plainPreview.slice(0, 320) + (plainPreview.length > 320 ? '…' : '')
    : 'No content available.';

  // Render Data
  card.querySelector('.final-score-val').textContent = final_rrf_score != null ? final_rrf_score.toFixed(4) : 'N/A';
  card.querySelector('.l2-score-val').textContent    = l2_score != null ? l2_score.toFixed(4) : 'N/A';
  card.querySelector('.bm25-score-val').textContent  = bm25_score != null ? bm25_score.toFixed(4) : 'N/A';
  card.querySelector('.chunks-val').textContent      = matched_chunks || 0;

  // L2: Thấp là tốt (Xanh lá). RRF & BM25: Cao là tốt (Xanh lá)
  colorScore(card.querySelector('.final-score-val'), final_rrf_score, 'high');
  colorScore(card.querySelector('.l2-score-val'), l2_score, 'low');
  colorScore(card.querySelector('.bm25-score-val'), bm25_score, 'high');

  // Logic vẽ thanh tiến trình đơn giản
  if (final_rrf_score != null) animateFill(card.querySelector('.final-fill'), Math.min(final_rrf_score * 1500, 100)); // Hệ số cho RRF
  if (l2_score != null) animateFill(card.querySelector('.l2-fill'), Math.max(0, 100 - (l2_score * 100))); // Đảo chiều cho L2
  if (bm25_score != null) animateFill(card.querySelector('.bm25-fill'), Math.min(bm25_score * 2.5, 100)); // Hệ số cho BM25

  // Expand / Collapse / Tabs switcher
  const expandBtn = card.querySelector('.expand-btn');
  const cardExpanded = card.querySelector('.card-expanded');
  const renderedPane = card.querySelector('[data-view="rendered"]');
  const rawPane = card.querySelector('[data-view="raw"]');
  const textSourceBadge = card.querySelector('.text-source-badge');
  const wikiBtn = card.querySelector('.open-wiki-btn');
  const tabs = card.querySelectorAll('.expand-tab');

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
      if (!renderedPane.dataset.loaded) {
        renderedPane.innerHTML = renderMarkdown(content || 'No content available.');
        rawPane.textContent = content || 'No content available.';
        renderedPane.dataset.loaded = '1';
      }
      wikiBtn.href = url;
      textSourceBadge.textContent = (text_source === 'full_article' || text_source === 'bm25_only')
        ? '📄 Full article matched' : '🔗 Merged from matched chunks';
      textSourceBadge.className = 'text-source-badge ' +
        ((text_source === 'full_article' || text_source === 'bm25_only') ? 'source-full' : 'source-merged');
      setVisible(cardExpanded, true);
    } else {
      setVisible(cardExpanded, false);
    }
  });

  return frag;
}

// ── Score color helper ────────────────────────────────────────────────────────
// Lower score = more relevant = green, higher = red
function colorScore(el, score, bestIs = 'low') {
  if (!el || score == null) return;
  el.classList.remove('score-good', 'score-mid', 'score-bad');
  
  if (bestIs === 'low') {
    if (score < 0.6) el.classList.add('score-good');
    else if (score < 1.0) el.classList.add('score-mid');
    else el.classList.add('score-bad');
  } else {
    // bestIs === 'high'
    if (score > 10.0) el.classList.add('score-good'); // Cho BM25 tốt
    else if (score > 0.02) el.classList.add('score-good'); // Cho RRF tốt
    else el.classList.add('score-mid');
  }
} // <-- ĐÃ THÊM DẤU ĐÓNG NGOẶC BỊ THIẾU Ở ĐÂY

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