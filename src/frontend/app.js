/**
 * WikiSearch – app.js
 * Connects to FastAPI backend at http://127.0.0.1:8000
 */

const API_BASE = 'http://127.0.0.1:8000';

// ── marked.js config ──────────────────────────────────────────────────────────
if (typeof marked !== 'undefined') {
  marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
}
function renderMarkdown(text) {
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text || ''); } catch { return escapeHtml(text); }
  }
  return escapeHtml(text);
}
function escapeHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── DOM References ────────────────────────────────────────────────────────────
const searchForm  = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const topKSelect  = document.getElementById('topKSelect');
const searchBtn   = document.getElementById('searchBtn');
const suggestions = document.getElementById('suggestions');
const statusBar   = document.getElementById('statusBar');
const statusText  = document.getElementById('statusText');
const metaQuery   = document.getElementById('metaQuery');
const metaTime    = document.getElementById('metaTime');
const loadingState = document.getElementById('loadingState');
const errorState   = document.getElementById('errorState');
const errorDesc    = document.getElementById('errorDesc');
const retryBtn     = document.getElementById('retryBtn');
const emptyState   = document.getElementById('emptyState');
const resultsList  = document.getElementById('resultsList');
const cardTemplate = document.getElementById('resultCardTemplate');

// ── State ─────────────────────────────────────────────────────────────────────
let lastQuery = '';
let lastK     = 5;

// ── Events ────────────────────────────────────────────────────────────────────
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = searchInput.value.trim();
  if (!q) { searchInput.focus(); return; }
  runSearch(q, parseInt(topKSelect.value, 10));
});
retryBtn.addEventListener('click', () => { if (lastQuery) runSearch(lastQuery, lastK); });
suggestions.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  searchInput.value = pill.dataset.query;
  runSearch(pill.dataset.query, parseInt(topKSelect.value, 10));
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  if (e.key === 'Escape' && document.activeElement === searchInput) searchInput.value = '';
});

// ── Core Search ───────────────────────────────────────────────────────────────
async function runSearch(query, k) {
  lastQuery = query; lastK = k;
  setVisible(loadingState, true);
  setVisible(statusBar, false); setVisible(errorState, false); setVisible(emptyState, false);
  resultsList.innerHTML = '';
  searchBtn.disabled = true;
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&k=${k}`);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `Server error ${res.status}`);
    }
    renderResults(await res.json());
  } catch (err) {
    showError(err.message || 'Cannot connect to backend.');
  } finally {
    setVisible(loadingState, false);
    searchBtn.disabled = false;
  }
}

// ── Render Results ────────────────────────────────────────────────────────────
function renderResults(data) {
  const { optimized_search_keyword, processing_time_ms, total_results,
          vector_pool_size, bm25_pool_size, data: articles } = data;

  statusText.textContent = `${total_results} result${total_results !== 1 ? 's' : ''} found`;
  metaQuery.textContent  = `🔍 "${optimized_search_keyword}"`;
  metaTime.textContent   = `⚡ ${processing_time_ms} ms`;
  setVisible(statusBar, true);

  if (!articles || articles.length === 0) { setVisible(emptyState, true); return; }
  articles.forEach((article, idx) => resultsList.appendChild(buildCard(article, idx)));
}

// ── Build Card ────────────────────────────────────────────────────────────────
function buildCard(article, idx) {
  const {
    rank, title, url, content, text_source,
    final_rrf_score, cosine_score, bm25_score,
    cosine_rank, bm25_rank, matched_chunks,
  } = article;

  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.result-card');
  card.style.animationDelay = `${idx * 0.07}s`;

  // Header
  card.querySelector('.rank-badge').textContent = `#${rank}`;
  card.querySelector('.card-title').textContent = title || 'Untitled';
  const urlEl = card.querySelector('.card-url');
  urlEl.href = url; urlEl.textContent = truncateUrl(url, 55); urlEl.title = url;

  // Source badge
  const sb = card.querySelector('.source-badge');
  if (text_source === 'full_article') { sb.textContent = '✓ Full article'; sb.classList.add('source-full'); }
  else { sb.textContent = '⚡ Merged chunks'; sb.classList.add('source-merged'); }

  // Content preview
  const preview = card.querySelector('.content-preview');
  const plain = (content || '')
    .replace(/#{1,6}\s/g,'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1')
    .replace(/`(.*?)`/g,'$1').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\n{2,}/g,' ').trim();
  preview.textContent = plain ? plain.slice(0, 320) + (plain.length > 320 ? '…' : '') : 'No content available.';

  // ── Score Dashboard ──

  // 1. Final Score (higher = better)
  const finalEl = card.querySelector('.final-score-val');
  finalEl.textContent = final_rrf_score != null ? final_rrf_score.toFixed(6) : 'N/A';
  colorHigherBetter(finalEl, final_rrf_score, 0.010, 0.005);
  animateFill(card.querySelector('.final-fill'), Math.min(100, (final_rrf_score || 0) * 8000));

  // 2. Cosine Score (lower = better) + rank badge
  const cosineEl   = card.querySelector('.cosine-score-val');
  const cosineRankEl = card.querySelector('.cosine-rank-badge');
  if (cosine_score != null) {
    cosineEl.textContent = cosine_score.toFixed(4);
    colorLowerBetter(cosineEl, cosine_score, 0.35, 0.62);
    animateFill(card.querySelector('.cosine-fill'), Math.max(5, 100 - cosine_score * 100));
    if (cosine_rank != null) {
      cosineRankEl.textContent = `#${cosine_rank} in vector`;
      cosineRankEl.classList.remove('rank-na');
    } else {
      cosineRankEl.textContent = '';
    }
  } else {
    // N/A — BM25-only article không có trong vector pool
    cosineEl.textContent      = 'N/A';
    cosineEl.classList.add('score-na');
    cosineRankEl.textContent  = 'not in vector pool';
    cosineRankEl.classList.add('rank-na');
    animateFill(card.querySelector('.cosine-fill'), 0);
  }

  // 3. BM25 Score (higher = better) + rank badge
  const bm25El     = card.querySelector('.bm25-score-val');
  const bm25RankEl = card.querySelector('.bm25-rank-badge');
  if (bm25_score != null && bm25_score > 0) {
    bm25El.textContent = bm25_score.toFixed(2);
    colorHigherBetter(bm25El, bm25_score, 10, 3);
    animateFill(card.querySelector('.bm25-fill'), Math.min(100, bm25_score * 3));
    if (bm25_rank != null) {
      bm25RankEl.textContent = `#${bm25_rank} in BM25`;
      bm25RankEl.classList.remove('rank-na');
    } else {
      bm25RankEl.textContent = '';
    }
  } else {
    // Không có trong BM25 pool
    bm25El.textContent      = 'N/A';
    bm25El.classList.add('score-na');
    bm25RankEl.textContent  = 'not in BM25 pool';
    bm25RankEl.classList.add('rank-na');
    animateFill(card.querySelector('.bm25-fill'), 0);
  }

  // 4. Chunks
  card.querySelector('.chunks-val').textContent = matched_chunks;

  // ── Expand ──
  const expandBtn    = card.querySelector('.expand-btn');
  const cardExpanded = card.querySelector('.card-expanded');
  const renderedPane = card.querySelector('[data-view="rendered"]');
  const rawPane      = card.querySelector('[data-view="raw"]');
  const tsBadge      = card.querySelector('.text-source-badge');
  const wikiBtn      = card.querySelector('.open-wiki-btn');
  const tabs         = card.querySelectorAll('.expand-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      setVisible(renderedPane, tab.dataset.tab === 'rendered');
      setVisible(rawPane,      tab.dataset.tab === 'raw');
    });
  });

  expandBtn.addEventListener('click', () => {
    const expanded = expandBtn.getAttribute('aria-expanded') === 'true';
    expandBtn.setAttribute('aria-expanded', String(!expanded));
    expandBtn.classList.toggle('active', !expanded);
    if (!expanded) {
      if (!renderedPane.dataset.loaded) {
        renderedPane.innerHTML = renderMarkdown(content || 'No content available.');
        rawPane.textContent    = content || 'No content available.';
        renderedPane.dataset.loaded = '1';
      }
      wikiBtn.href = url;
      tsBadge.textContent = text_source === 'full_article' ? '📄 Full article from JSON' : '🔗 Merged from matched chunks';
      tsBadge.className   = 'text-source-badge ' + (text_source === 'full_article' ? 'source-full' : 'source-merged');
      setVisible(cardExpanded, true);
    } else {
      setVisible(cardExpanded, false);
    }
  });

  return frag;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function colorHigherBetter(el, v, good, mid) {
  if (!el || v == null) return;
  el.classList.remove('score-good','score-mid','score-bad');
  el.classList.add(v >= good ? 'score-good' : v >= mid ? 'score-mid' : 'score-bad');
}
function colorLowerBetter(el, v, good, mid) {
  if (!el || v == null) return;
  el.classList.remove('score-good','score-mid','score-bad');
  el.classList.add(v < good ? 'score-good' : v < mid ? 'score-mid' : 'score-bad');
}

function showError(msg) { errorDesc.textContent = msg; setVisible(errorState, true); setVisible(loadingState, false); }
function setVisible(el, v) { el.hidden = !v; }
function truncateUrl(url, max) {
  try { const u = new URL(url); const s = u.hostname + u.pathname; return s.length > max ? s.slice(0,max)+'…' : s; }
  catch { return url.length > max ? url.slice(0,max)+'…' : url; }
}
function animateFill(el, pct) {
  if (!el) return;
  el.style.width = '0%';
  requestAnimationFrame(() => setTimeout(() => { el.style.width = Math.max(0,Math.min(100,pct))+'%'; }, 80));
}