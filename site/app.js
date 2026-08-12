/**
 * Renders the highlight grid from data/highlights.json.
 *
 * Everything here is plain DOM work - no framework, no build step. Titles and
 * channel names come from a remote feed, so they are only ever set as text
 * nodes, never parsed as HTML.
 */

const DATA_URL = 'data/highlights.json';
const YOUTUBE_ID = /^[\w-]{6,20}$/;

const els = {
  grid: document.getElementById('grid'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  chips: document.getElementById('promotions'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  updated: document.getElementById('updated-label'),
  player: document.getElementById('player'),
  frame: document.getElementById('player-frame'),
  playerTitle: document.getElementById('player-title'),
  playerSub: document.getElementById('player-sub'),
  playerLink: document.getElementById('player-link'),
};

const state = {
  items: [],
  promotions: [],
  active: new Set(),
  query: '',
  sort: 'rank',
  lastFocused: null,
};

/* ---------------------------------------------------------------- helpers */

const RELATIVE_UNITS = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "3 hours ago" for an ISO timestamp; empty string when unparseable. */
function timeAgo(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';

  const diff = time - Date.now();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) return relativeFormatter.format(Math.round(diff / ms), unit);
  }
  return relativeFormatter.format(Math.round(diff / 1000), 'second');
}

/** "1.2M views" - omitted entirely when the feed reported no count. */
function formatViews(views) {
  if (!views) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`;
  if (views >= 1_000) return `${Math.round(views / 1000)}K views`;
  return `${views} views`;
}

function setStatus(message, { error = false } = {}) {
  els.status.textContent = message ?? '';
  els.status.classList.toggle('status--error', error);
  els.status.hidden = !message;
}

/* --------------------------------------------------------------- rendering */

function buildCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';
  card.dataset.id = item.id;

  const media = document.createElement('div');
  media.className = 'card__media';

  const img = document.createElement('img');
  img.src = item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  // A dead thumbnail should leave a clean tile, not a broken-image glyph.
  img.addEventListener('error', () => img.remove(), { once: true });
  media.append(img);

  const badge = document.createElement('span');
  badge.className = 'card__badge';
  badge.textContent = item.sourceName || item.source || 'MMA';
  media.append(badge);

  const play = document.createElement('div');
  play.className = 'card__play';
  play.append(document.createElement('span'));
  media.append(play);

  const body = document.createElement('div');
  body.className = 'card__body';

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title;
  body.append(title);

  const meta = document.createElement('div');
  meta.className = 'card__meta';
  for (const text of [timeAgo(item.published), formatViews(item.views)].filter(Boolean)) {
    const span = document.createElement('span');
    span.textContent = text;
    meta.append(span);
  }
  body.append(meta);

  card.append(media, body);
  card.addEventListener('click', () => openPlayer(item));
  return card;
}

function renderChips() {
  els.chips.replaceChildren();
  if (state.promotions.length === 0) return;

  for (const promotion of state.promotions) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(state.active.has(promotion.id)));
    if (promotion.accent) chip.style.setProperty('--chip-accent', promotion.accent);

    const dot = document.createElement('span');
    dot.className = 'chip__dot';
    const label = document.createElement('span');
    label.textContent = promotion.name;
    chip.append(dot, label);

    chip.addEventListener('click', () => {
      // Chips are additive: no selection means "everything".
      if (state.active.has(promotion.id)) state.active.delete(promotion.id);
      else state.active.add(promotion.id);
      renderChips();
      renderGrid();
    });

    els.chips.append(chip);
  }
}

function visibleItems() {
  const query = state.query.trim().toLowerCase();

  const filtered = state.items.filter((item) => {
    if (state.active.size > 0 && !state.active.has(item.source)) return false;
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      (item.sourceName ?? '').toLowerCase().includes(query)
    );
  });

  const comparators = {
    rank: (a, b) => b.rank - a.rank,
    newest: (a, b) => Date.parse(b.published) - Date.parse(a.published),
    views: (a, b) => (b.views || 0) - (a.views || 0),
  };
  return filtered.sort(comparators[state.sort] ?? comparators.rank);
}

function renderGrid() {
  const items = visibleItems();
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.append(buildCard(item));
  els.grid.replaceChildren(fragment);

  if (items.length > 0) {
    setStatus('');
  } else if (state.items.length === 0) {
    setStatus('No highlights yet. Run `npm run update` to fetch the latest clips.');
  } else {
    setStatus('No highlights match those filters.');
  }
}

/* ------------------------------------------------------------------ player */

function openPlayer(item) {
  if (!YOUTUBE_ID.test(item.id)) return;

  state.lastFocused = document.activeElement;

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`;
  iframe.title = item.title;
  iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  els.frame.replaceChildren(iframe);

  els.playerTitle.textContent = item.title;
  els.playerSub.textContent = [item.sourceName, timeAgo(item.published), formatViews(item.views)]
    .filter(Boolean)
    .join(' · ');
  els.playerLink.href = `https://www.youtube.com/watch?v=${item.id}`;

  els.player.hidden = false;
  document.body.classList.add('is-locked');
  els.player.querySelector('.player__close').focus();
}

function closePlayer() {
  if (els.player.hidden) return;
  els.player.hidden = true;
  // Dropping the iframe is what actually stops playback.
  els.frame.replaceChildren();
  document.body.classList.remove('is-locked');
  state.lastFocused?.focus?.();
}

/** Keep tabbing inside the dialog while it is open. */
function trapFocus(event) {
  if (els.player.hidden || event.key !== 'Tab') return;
  const focusable = els.player.querySelectorAll('button, a[href], iframe');
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* -------------------------------------------------------------------- boot */

function renderUpdated(updated) {
  if (!updated) {
    els.updated.textContent = 'Not fetched yet';
    return;
  }
  const ago = timeAgo(updated);
  els.updated.textContent = ago ? `Updated ${ago}` : 'Updated';
}

/** Debounce so typing does not rebuild the grid on every keystroke. */
function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function load() {
  try {
    // Cache-bust so a refreshed data file is picked up on reload.
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    state.items = Array.isArray(payload.items) ? payload.items : [];
    state.promotions = Array.isArray(payload.promotions) ? payload.promotions : [];

    renderUpdated(payload.updated);
    renderChips();
    renderGrid();
  } catch (error) {
    els.grid.replaceChildren();
    els.updated.textContent = 'Unavailable';
    setStatus(
      `Could not load highlights (${error.message}). If you opened this file directly, ` +
        'start the local server with `npm start` instead.',
      { error: true },
    );
  } finally {
    els.results.setAttribute('aria-busy', 'false');
  }
}

els.search.addEventListener(
  'input',
  debounce((event) => {
    state.query = event.target.value;
    renderGrid();
  }),
);

els.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  renderGrid();
});

els.player.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close')) closePlayer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closePlayer();
  trapFocus(event);
});

load();
