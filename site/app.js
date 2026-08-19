/**
 * Renders the clip feed from data/highlights.json.
 *
 * Plain DOM work - no framework, no build step. Titles and channel names come
 * from a remote feed, so they are only ever written as text nodes.
 */

const DATA_URL = 'data/highlights.json';
const YOUTUBE_ID = /^[\w-]{6,20}$/;

const el = (id) => document.getElementById(id);
const els = {
  masthead: el('masthead'),
  hero: el('hero'),
  sections: el('sections'),
  status: el('status'),
  feed: el('feed'),
  chips: el('promotions'),
  window: el('window'),
  search: el('search'),
  sort: el('sort'),
  updated: el('updated-label'),
  toTop: el('to-top'),
  player: el('player'),
  frame: el('player-frame'),
  pTitle: el('player-title'),
  pSub: el('player-sub'),
  pLink: el('player-link'),
  pPrev: el('player-prev'),
  pNext: el('player-next'),
  pCount: el('player-count'),
};

const state = {
  items: [],
  promotions: [],
  active: new Set(),
  query: '',
  sort: 'rank',
  days: 0,
  /** The list the player steps through - whatever is on screen. */
  queue: [],
  index: -1,
  lastFocused: null,
};

/* ------------------------------------------------------------- formatting */

const UNITS = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function timeAgo(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '';

  const diff = time - Date.now();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(Math.round(diff / 1000), 'second');
}

function formatViews(views) {
  if (!views) return '';
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (views >= 1_000) return `${Math.round(views / 1000)}K`;
  return String(views);
}

const accentOf = (id) => state.promotions.find((p) => p.id === id)?.accent ?? 'var(--accent)';

/**
 * Thumbnail that fills a 16:9 frame. hqdefault is 4:3 with black bars, so
 * prefer YouTube's widescreen renditions and fall back down the chain.
 */
function thumb(item, big = false) {
  const img = document.createElement('img');
  const chain = big
    ? [`https://i.ytimg.com/vi/${item.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${item.id}/hq720.jpg`, item.thumbnail]
    : [`https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`, item.thumbnail];

  let attempt = 0;
  img.src = chain[0];
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    attempt += 1;
    if (attempt < chain.length) img.src = chain[attempt];
    else img.style.opacity = '0';
  });
  return img;
}

/* --------------------------------------------------------------- building */

function badge(item) {
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.style.setProperty('--tag-accent', accentOf(item.source));
  tag.textContent = item.sourceName || item.source;
  return tag;
}

function buildCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'card';

  const media = document.createElement('div');
  media.className = 'card__media';
  media.append(thumb(item), badge(item));

  const views = formatViews(item.views);
  if (views) {
    const v = document.createElement('span');
    v.className = 'views';
    v.textContent = `${views} views`;
    media.append(v);
  }

  const play = document.createElement('div');
  play.className = 'card__play';
  play.append(document.createElement('i'));
  media.append(play);

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = item.title;

  const meta = document.createElement('div');
  meta.className = 'card__meta';
  const who = document.createElement('b');
  who.textContent = item.sourceName || '';
  meta.append(who, document.createTextNode(`· ${timeAgo(item.published)}`));

  card.append(media, title, meta);
  card.addEventListener('click', () => open(item));
  return card;
}

function buildQueueRow(item) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'queue';

  const box = document.createElement('div');
  box.className = 'queue__thumb';
  box.append(thumb(item));

  const body = document.createElement('div');
  body.className = 'queue__body';

  const title = document.createElement('span');
  title.className = 'queue__title';
  title.textContent = item.title;

  const meta = document.createElement('span');
  meta.className = 'queue__meta';
  meta.textContent = [item.sourceName, timeAgo(item.published)].filter(Boolean).join(' · ');

  body.append(title, meta);
  row.append(box, body);
  row.addEventListener('click', () => open(item));
  return row;
}

function renderHero(items) {
  // The hero is a view of the top of the feed, so it only makes sense in the
  // default ordering. Once someone sorts or searches, get out of the way.
  // The hero plus its rundown eats five clips, so it only earns its place when
  // enough are left to fill a grid underneath - otherwise filtering to a small
  // promotion leaves the page looking truncated.
  const isDefaultView = state.sort === 'rank' && !state.query.trim();
  if (!isDefaultView || items.length < 9) {
    els.hero.hidden = true;
    els.hero.replaceChildren();
    return { rest: items };
  }

  const [lead, ...others] = items;
  const upNext = others.slice(0, 4);

  const grid = document.createElement('div');
  grid.className = 'hero__grid';

  const feature = document.createElement('button');
  feature.type = 'button';
  feature.className = 'feature';

  const scrim = document.createElement('div');
  scrim.className = 'feature__scrim';

  const body = document.createElement('div');
  body.className = 'feature__body';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'feature__eyebrow';
  const dot = document.createElement('span');
  dot.className = 'chip__dot';
  dot.style.background = accentOf(lead.source);
  eyebrow.append(dot, document.createTextNode(lead.sourceName || ''));
  const when = document.createElement('span');
  when.textContent = `· ${timeAgo(lead.published)}`;
  eyebrow.append(when);

  const title = document.createElement('h2');
  title.className = 'feature__title';
  title.textContent = lead.title;

  const cta = document.createElement('span');
  cta.className = 'feature__cta';
  cta.textContent = 'Watch';

  body.append(eyebrow, title, cta);
  feature.append(thumb(lead, true), scrim, body);
  feature.addEventListener('click', () => open(lead));

  const rundown = document.createElement('div');
  rundown.className = 'rundown';
  const head = document.createElement('div');
  head.className = 'rundown__head';
  head.append(document.createTextNode('Up next'));
  rundown.append(head, ...upNext.map(buildQueueRow));

  grid.append(feature, rundown);
  els.hero.replaceChildren(grid);
  els.hero.hidden = false;

  return { rest: items.slice(5) };
}

/** Group by how recent a clip is - closer to how fans think than a flat list. */
function band(items) {
  const now = Date.now();
  const bands = [
    { title: 'Last 24 hours', max: 86_400_000 },
    { title: 'This week', max: 604_800_000 },
    { title: 'Earlier this month', max: 2_592_000_000 },
    { title: 'Older', max: Infinity },
  ].map((b) => ({ ...b, items: [] }));

  for (const item of items) {
    const age = now - Date.parse(item.published);
    (bands.find((b) => age < b.max) ?? bands[bands.length - 1]).items.push(item);
  }
  return bands.filter((b) => b.items.length > 0);
}

function renderSkeletons() {
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (let i = 0; i < 8; i += 1) {
    const card = document.createElement('div');
    card.className = 'card skeleton';
    const media = document.createElement('div');
    media.className = 'card__media';
    const l1 = document.createElement('div');
    l1.className = 'card__line';
    const l2 = document.createElement('div');
    l2.className = 'card__line card__line--short';
    card.append(media, l1, l2);
    grid.append(card);
  }
  els.sections.replaceChildren(grid);
}

/* -------------------------------------------------------------- filtering */

function visible() {
  const query = state.query.trim().toLowerCase();
  const cutoff = state.days ? Date.now() - state.days * 86_400_000 : 0;

  const items = state.items.filter((item) => {
    if (state.active.size > 0 && !state.active.has(item.source)) return false;
    if (cutoff && Date.parse(item.published) < cutoff) return false;
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      (item.sourceName ?? '').toLowerCase().includes(query)
    );
  });

  const by = {
    rank: (a, b) => b.rank - a.rank,
    newest: (a, b) => Date.parse(b.published) - Date.parse(a.published),
    views: (a, b) => (b.views || 0) - (a.views || 0),
  };
  return items.sort(by[state.sort] ?? by.rank);
}

function render() {
  const items = visible();
  state.queue = items;

  if (items.length === 0) {
    els.hero.hidden = true;
    els.hero.replaceChildren();
    els.sections.replaceChildren();
    if (state.items.length === 0) {
      els.status.innerHTML =
        'No clips yet. Run <code>npm run update</code> to fetch the latest highlights.';
    } else {
      els.status.textContent = 'Nothing matches those filters.';
    }
    els.status.hidden = false;
    return;
  }

  els.status.hidden = true;
  const { rest } = renderHero(items);

  const frag = document.createDocumentFragment();
  for (const group of band(rest)) {
    const section = document.createElement('section');
    section.className = 'band';

    const head = document.createElement('div');
    head.className = 'band__head';
    const title = document.createElement('h2');
    title.className = 'band__title';
    title.textContent = group.title;
    const rule = document.createElement('span');
    rule.className = 'band__rule';
    const count = document.createElement('span');
    count.className = 'band__n';
    count.textContent = `${group.items.length} clip${group.items.length === 1 ? '' : 's'}`;
    head.append(title, rule, count);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of group.items) grid.append(buildCard(item));

    section.append(head, grid);
    frag.append(section);
  }
  els.sections.replaceChildren(frag);
}

function renderChips() {
  els.chips.replaceChildren();
  for (const promotion of state.promotions) {
    const n = state.items.filter((i) => i.source === promotion.id).length;
    if (n === 0) continue;

    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.setAttribute('aria-pressed', String(state.active.has(promotion.id)));
    if (promotion.accent) chip.style.setProperty('--chip-accent', promotion.accent);

    const dot = document.createElement('span');
    dot.className = 'chip__dot';
    const label = document.createElement('span');
    label.textContent = promotion.name;
    const count = document.createElement('span');
    count.className = 'chip__n';
    count.textContent = n;
    chip.append(dot, label, count);

    chip.addEventListener('click', () => {
      if (state.active.has(promotion.id)) state.active.delete(promotion.id);
      else state.active.add(promotion.id);
      renderChips();
      render();
    });
    els.chips.append(chip);
  }
}

/* ----------------------------------------------------------------- player */

function open(item) {
  if (!YOUTUBE_ID.test(item.id)) return;

  state.index = state.queue.findIndex((q) => q.id === item.id);
  if (els.player.hidden) state.lastFocused = document.activeElement;

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`;
  iframe.title = item.title;
  iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  els.frame.replaceChildren(iframe);

  els.pTitle.textContent = item.title;
  const views = formatViews(item.views);
  els.pSub.textContent = [item.sourceName, timeAgo(item.published), views && `${views} views`]
    .filter(Boolean)
    .join(' · ');
  els.pLink.href = `https://www.youtube.com/watch?v=${item.id}`;

  const total = state.queue.length;
  els.pCount.textContent = state.index >= 0 ? `${state.index + 1} / ${total}` : '';
  els.pPrev.disabled = state.index <= 0;
  els.pNext.disabled = state.index < 0 || state.index >= total - 1;

  if (els.player.hidden) {
    els.player.hidden = false;
    document.body.classList.add('is-locked');
    els.player.querySelector('.player__close').focus();
  }
}

function step(delta) {
  const next = state.index + delta;
  if (next >= 0 && next < state.queue.length) open(state.queue[next]);
}

function close() {
  if (els.player.hidden) return;
  els.player.hidden = true;
  // Dropping the iframe is what actually stops playback.
  els.frame.replaceChildren();
  document.body.classList.remove('is-locked');
  state.lastFocused?.focus?.();
}

function trapFocus(event) {
  if (els.player.hidden || event.key !== 'Tab') return;
  const focusable = [...els.player.querySelectorAll('button, a[href], iframe')].filter(
    (node) => !node.disabled,
  );
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

/* ------------------------------------------------------------------- boot */

function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function load() {
  renderSkeletons();
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    state.items = Array.isArray(payload.items) ? payload.items : [];
    state.promotions = Array.isArray(payload.promotions) ? payload.promotions : [];

    els.updated.textContent = payload.updated ? `Updated ${timeAgo(payload.updated)}` : 'Not fetched yet';
    renderChips();
    render();
  } catch (error) {
    els.sections.replaceChildren();
    els.updated.textContent = 'Unavailable';
    els.status.innerHTML =
      `Could not load clips (${error.message}). If you opened this file directly, ` +
      'serve it with <code>npm start</code> instead.';
    els.status.classList.add('status--error');
    els.status.hidden = false;
  } finally {
    els.feed.setAttribute('aria-busy', 'false');
  }
}

els.search.addEventListener(
  'input',
  debounce((event) => {
    state.query = event.target.value;
    render();
  }),
);

els.sort.addEventListener('change', (event) => {
  state.sort = event.target.value;
  render();
});

els.window.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  state.days = Number(button.dataset.days);
  for (const b of els.window.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b === button));
  }
  render();
});

els.player.addEventListener('click', (event) => {
  if (event.target.hasAttribute('data-close')) close();
});
els.pPrev.addEventListener('click', () => step(-1));
els.pNext.addEventListener('click', () => step(1));

document.addEventListener('keydown', (event) => {
  if (!els.player.hidden) {
    if (event.key === 'Escape') close();
    // Step through the feed without reaching for the mouse.
    if (event.key === 'ArrowRight') step(1);
    if (event.key === 'ArrowLeft') step(-1);
    trapFocus(event);
    return;
  }
  // "/" focuses search, the convention on content-heavy sites.
  if (event.key === '/' && document.activeElement !== els.search) {
    event.preventDefault();
    els.search.focus();
  }
});

els.toTop.addEventListener('click', () => window.scrollTo({ top: 0 }));

const onScroll = () => {
  els.masthead.classList.toggle('is-stuck', window.scrollY > 8);
  els.toTop.hidden = window.scrollY < 700;
};
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

load();
