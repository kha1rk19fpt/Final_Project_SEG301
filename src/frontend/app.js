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
  return (str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function qs(root, sel) {
  const el = root.querySelector(sel);
  if (!el) {
    console.warn(`[WikiSearch] querySelector("${sel}") trả về null.`);
  }
  return el;
}

function setText(root, sel, value) {
  const el = qs(root, sel);
  if (el) el.textContent = value;
}

function setHref(root, sel, value) {
  const el = qs(root, sel);
  if (el) el.href = value;
}

// ── DOM References ────────────────────────────────────────────────────────────
const searchForm   = document.getElementById('searchForm');
const searchInput  = document.getElementById('searchInput');
const topKSelect   = document.getElementById('topKSelect');
const searchBtn    = document.getElementById('searchBtn');
const suggestions  = document.getElementById('suggestions');

const statusBar  = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const metaQuery  = document.getElementById('metaQuery');
const metaTime   = document.getElementById('metaTime');

const loadingState = document.getElementById('loadingState');
const errorState   = document.getElementById('errorState');
const errorDesc    = document.getElementById('errorDesc');
const retryBtn     = document.getElementById('retryBtn');
const emptyState   = document.getElementById('emptyState');
const resultsList  = document.getElementById('resultsList');
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

suggestions.addEventListener('click', (e) => {
  const pill = e.target.closest('.pill');
  if (!pill) return;
  const q = pill.dataset.query;
  searchInput.value = q;
  runSearch(q, parseInt(topKSelect.value, 10));
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
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

    if (!data || typeof data !== 'object') {
      throw new Error('Response từ backend không hợp lệ (không phải JSON object).');
    }

    renderResults(data);

  } catch (err) {
    const msg = err instanceof TypeError
      ? `Lỗi JavaScript: ${err.message} — Kiểm tra Console (F12) để biết thêm.`
      : err.message || 'Không thể kết nối backend. Kiểm tra uvicorn đang chạy trên port 8000.';
    showError(msg);
    console.error('[WikiSearch] runSearch error:', err);
  } finally {
    setVisible(loadingState, false);
    searchBtn.disabled = false;
  }
}

// ── Render Results (Đã sửa lỗi thống kê Min/Max) ─────────────────────────────
function renderResults(data) {
  const {
    optimized_search_keyword,
    processing_time_ms,
    total_results,
    data: articles,
  } = data;

  if (statusText) statusText.textContent = `${total_results} result${total_results !== 1 ? 's' : ''} found`;
  if (metaQuery)  metaQuery.textContent  = `🔍 "${optimized_search_keyword}"`;
  if (metaTime)   metaTime.textContent   = `⚡ ${processing_time_ms} ms`;
  setVisible(statusBar, true);

  if (!articles || articles.length === 0) {
    setVisible(emptyState, true);
    return;
  }

  // Lấy dải điểm riêng biệt cho từng metric
  const rrfScores = articles.map(a => a.final_rrf_score).filter(s => s != null);
  const cosScores = articles.map(a => a.cosine_score).filter(s => s != null);
  const bm25Scores = articles.map(a => a.bm25_score).filter(s => s != null);

  const stats = {
    minRrf: rrfScores.length ? Math.min(...rrfScores) : 0,
    maxRrf: rrfScores.length ? Math.max(...rrfScores) : 1,
    minCos: cosScores.length ? Math.min(...cosScores) : 0,
    maxCos: cosScores.length ? Math.max(...cosScores) : 1,
    minBm25: bm25Scores.length ? Math.min(...bm25Scores) : 0,
    maxBm25: bm25Scores.length ? Math.max(...bm25Scores) : 1,
  };

  articles.forEach((article, idx) => {
    try {
      const card = buildCard(article, idx, stats);
      if (card) resultsList.appendChild(card);
    } catch (err) {
      console.error(`[WikiSearch] Lỗi khi render card #${idx + 1}:`, err);
    }
  });
}

// ── Build a Single Result Card (Đã áp dụng thông số stats) ───────────────────
function buildCard(article, idx, stats) {
  if (!cardTemplate) {
    console.error('[WikiSearch] Không tìm thấy #resultCardTemplate trong HTML!');
    return null;
  }

  const {
    rank, title, url, content,
    final_rrf_score, cosine_score, bm25_score,
    cosine_rank, bm25_rank,
    matched_chunks, text_source,
  } = article;

  const frag = cardTemplate.content.cloneNode(true);
  const card = frag.querySelector('.result-card');

  if (!card) return frag;

  card.style.animationDelay = `${idx * 0.07}s`;

  setText(card, '.rank-badge', `#${rank}`);
  setText(card, '.card-title', title || 'Untitled');

  const urlEl = qs(card, '.card-url');
  if (urlEl) {
    urlEl.href        = url;
    urlEl.textContent = truncateUrl(url, 55);
    urlEl.title       = url;
  }

  const sourceBadge = qs(card, '.source-badge');
  if (sourceBadge) {
    if (text_source === 'full_article') {
      sourceBadge.textContent = '✓ Full article';
      sourceBadge.classList.add('source-full');
    } else {
      sourceBadge.textContent = '⚡ Merged chunks';
      sourceBadge.classList.add('source-merged');
    }
  }

  const preview = qs(card, '.content-preview');
  if (preview) {
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
  }

  const wEl = qs(card, '.final-score-val');
  const bEl = qs(card, '.cosine-score-val');
  const aEl = qs(card, '.bm25-score-val');
  const cEl = qs(card, '.chunks-val');

  if (wEl) wEl.textContent = final_rrf_score != null ? final_rrf_score.toFixed(4) : 'N/A';
  if (bEl) bEl.textContent = cosine_score    != null ? cosine_score.toFixed(4)    : 'N/A';
  if (aEl) aEl.textContent = bm25_score      != null ? bm25_score.toFixed(4)      : 'N/A';
  if (cEl) cEl.textContent = matched_chunks;

  colorScoreRRF(wEl, final_rrf_score);
  colorScore(bEl, cosine_score); 
  colorScoreBM25(aEl, bm25_score);

  const cosineRankEl = qs(card, '.cosine-rank-badge');
  const bm25RankEl   = qs(card, '.bm25-rank-badge');
  if (cosineRankEl) {
    if (cosine_rank != null) {
      cosineRankEl.textContent = `#${cosine_rank} in vector`;
    } else {
      cosineRankEl.textContent = '';
      cosineRankEl.classList.add('rank-na');
    }
  }
  if (bm25RankEl) {
    if (bm25_rank != null) {
      bm25RankEl.textContent = `#${bm25_rank} in BM25`;
    } else {
      bm25RankEl.textContent = '';
      bm25RankEl.classList.add('rank-na');
    }
  }

  // Tính thanh bar với range riêng biệt
  const rrfRange = stats.maxRrf - stats.minRrf || 1;
  const cosRange = stats.maxCos - stats.minCos || 1;
  const bm25Range = stats.maxBm25 - stats.minBm25 || 1;

  const relFillRrf = (s) => s == null ? 0 : Math.max(10, Math.min(100, ((s - stats.minRrf) / rrfRange) * 80 + 20));
  const relFillBm25 = (s) => s == null ? 0 : Math.max(10, Math.min(100, ((s - stats.minBm25) / bm25Range) * 80 + 20));
  const relFillCos = (s) => s == null ? 0 : Math.max(10, Math.min(100, 100 - ((s - stats.minCos) / cosRange) * 80));

  const wFill = qs(card, '.final-fill');
  const bFill = qs(card, '.cosine-fill');
  const aFill = qs(card, '.bm25-fill');

  if (wFill && final_rrf_score != null) animateFill(wFill, relFillRrf(final_rrf_score));
  if (bFill && cosine_score    != null) animateFill(bFill, relFillCos(cosine_score));
  if (aFill && bm25_score      != null) animateFill(aFill, relFillBm25(bm25_score));

  // Expand logic
  const expandBtn      = qs(card, '.expand-btn');
  const cardExpanded   = qs(card, '.card-expanded');
  const renderedPane   = qs(card, '[data-view="rendered"]');
  const rawPane        = qs(card, '[data-view="raw"]');
  const textSourceBadge = qs(card, '.text-source-badge');
  const wikiBtn        = qs(card, '.open-wiki-btn');
  const tabs           = card.querySelectorAll('.expand-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.tab;
      if (renderedPane) setVisible(renderedPane, view === 'rendered');
      if (rawPane)      setVisible(rawPane,      view === 'raw');
    });
  });

  if (expandBtn && cardExpanded) {
    expandBtn.addEventListener('click', () => {
      const isExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
      expandBtn.setAttribute('aria-expanded', String(!isExpanded));
      expandBtn.classList.toggle('active', !isExpanded);

      if (!isExpanded) {
        if (renderedPane && !renderedPane.dataset.loaded) {
          renderedPane.innerHTML = renderMarkdown(content || 'No content available.');
          if (rawPane) rawPane.textContent = content || 'No content available.';
          renderedPane.dataset.loaded = '1';
        }
        if (wikiBtn) wikiBtn.href = url;

        if (textSourceBadge) {
          textSourceBadge.textContent = text_source === 'full_article'
            ? '📄 Full article from JSON'
            : '🔗 Merged from matched chunks';
          textSourceBadge.className = 'text-source-badge ' +
            (text_source === 'full_article' ? 'source-full' : 'source-merged');
        }

        setVisible(cardExpanded, true);
      } else {
        setVisible(cardExpanded, false);
      }
    });
  }

  return frag;
}

// ── Score color helpers ───────────────────────────────────────────────────────
function colorScore(el, score) {
  if (!el) return;
  el.classList.remove('score-good', 'score-mid', 'score-bad');
  if (score == null) return;
  if (score < 0.35)      el.classList.add('score-good');
  else if (score < 0.60) el.classList.add('score-mid');
  else                   el.classList.add('score-bad');
}
function colorScoreRRF(el, score) {
  if (!el) return;
  el.classList.remove('score-good', 'score-mid', 'score-bad');
  if (score == null) return;
  if (score > 0.02)      el.classList.add('score-good');
  else if (score > 0.01) el.classList.add('score-mid');
  else                   el.classList.add('score-bad');
}
function colorScoreBM25(el, score) {
  if (!el) return;
  el.classList.remove('score-good', 'score-mid', 'score-bad');
  if (score == null) return;
  if (score > 10)     el.classList.add('score-good');
  else if (score > 4) el.classList.add('score-mid');
  else                el.classList.add('score-bad');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function showError(message) {
  if (errorDesc) errorDesc.textContent = message;
  setVisible(errorState, true);
  setVisible(loadingState, false);
}

function setVisible(el, visible) {
  if (el) el.hidden = !visible;
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
  if (!el) return;
  el.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { el.style.width = pct + '%'; }, 80);
  });
}