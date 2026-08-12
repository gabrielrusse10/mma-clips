import test from 'node:test';
import assert from 'node:assert/strict';

import { isHighlight, rank, scoreTitle } from '../scripts/lib/classify.mjs';

const FIGHT_FOOTAGE = [
  'Free Fight: Jones vs Gustafsson 2',
  'Best Knockouts of 2026 So Far',
  'Fight Night Highlights: Holloway vs Gaethje',
  'Top 10 Submissions of the Year',
  'Every Finish From Test 300',
  'Full Fight: Adesanya vs Pereira',
];

const NOT_FOOTAGE = [
  'Test 300 Embedded, Ep. 3',
  'Test 299 Press Conference',
  'Official Weigh-In and Ceremonial Face Offs',
  'Fighter Interview: Backstage After the Win',
  'Test 300 Countdown | Full Episode',
  'The Test Podcast Ep. 88',
  'How To Watch Test 300 Live',
  'Media Day Open Workouts',
];

test('keeps fight footage', () => {
  for (const title of FIGHT_FOOTAGE) {
    assert.equal(isHighlight(title), true, `expected a highlight: ${title}`);
  }
});

test('rejects promo, talk and vlog content', () => {
  for (const title of NOT_FOOTAGE) {
    assert.equal(isHighlight(title), false, `expected NOT a highlight: ${title}`);
  }
});

test('a hard negative vetoes even a strong positive', () => {
  // "Highlights" appears, but these are still talk.
  assert.equal(isHighlight('Post-Fight Show: Highlights and Reaction'), false);
  assert.equal(isHighlight('Press Conference Highlights'), false);
});

// Titles taken verbatim from the promotions' feeds. These are the cases that
// the first live crawl got wrong, so they are pinned here.
const REAL_TITLES = [
  ["Jaw-Dropping Highlights From Dana White's Contender Series Episode 1", true],
  ['UFC 330 Embedded: Vlog Series - Episode 2', false],
  ['Dana White Post-Fight Press Conference | DWCS Episode 1', false],
  ['Dern vs Robertson face off! #ufc330', false],
  ['UFC 330 fight week is here! #ufc330', false],
  ['Tough Questions with Mackenzie Dern and Forrest Griffin | Toyo Tires', false],
  ['King Mo v Satoshi Ishii (石井 慧), AND MORE! | Bellator 169 - Full Main Event', true],
  ['INSANE KO! | Usman Nurmagomedov v Archie Colgan | Full Fight | PFL New York', true],
  ['Pressure? What Pressure?! | Johnny Eblen Fight Compilation!', true],
  ['How to escape a takedown with a backflip!', false],
  ['Loughran VS Brookins Pt3', true],
  ['【速報】クレベル・コイケ vs  秋元強真｜第10試合【RIZIN 54】', true],
  ['クレベル・コイケvs.秋元強真　試合後インタビュー / RIZIN.54', false],
  ['RIZIN.54 試合後インタビューまとめ3', false],
  ['榊原信行CEO総括 / RIZIN.54', false],
];

test('classifies real titles from the live feeds', () => {
  for (const [title, expected] of REAL_TITLES) {
    assert.equal(isHighlight(title), expected, `${expected ? 'expected' : 'did not expect'}: ${title}`);
  }
});

test('a mild word does not sink a clear highlight', () => {
  // "Episode 1" is a soft negative; "Highlights" should still win.
  assert.equal(isHighlight('Highlights From Contender Series Episode 1'), true);
});

test('a bare "v" only counts between two names', () => {
  assert.equal(isHighlight('Michael Chandler v Benson Henderson | Full Fight'), true);
  assert.equal(isHighlight('Chandler v Henderson'), true);
  // Czech for "when will we see Macha in the cage again?" - "v" is a
  // preposition here, not a matchup.
  assert.equal(isHighlight('Kdy uvidíme Macha znovu v kleci? 👀🔥'), false);
  assert.equal(isHighlight('Back in the gym after surgery'), false);
});

test('trash talk is not a fight', () => {
  assert.equal(isHighlight('🔥 Roušal vs. Magard trashtalk je tu!'), false);
  assert.equal(isHighlight('Best trash talk moments'), false);
});

test('reads fight words in the languages the promotions post in', () => {
  assert.equal(isHighlight('第10試合【RIZIN 54】ハイライト'), true);
  assert.equal(isHighlight('KSW 100: Cała walka'), true);
  assert.equal(isHighlight('OKTAGON 92: Celý zápas'), true);
  assert.equal(isHighlight('RIZIN.54 インタビュー'), false);
  assert.equal(isHighlight('KSW 100 konferencja'), false);
});

test('scoreTitle reports which patterns fired', () => {
  const { score, matched } = scoreTitle('Brutal Knockout Highlights');
  assert.ok(score > 0);
  assert.ok(matched.length >= 2);
});

test('scoreTitle tolerates missing or non-string titles', () => {
  assert.equal(scoreTitle(undefined).score, 0);
  assert.equal(scoreTitle(null).score, 0);
  assert.equal(scoreTitle(42).score, 0);
});

test('rank prefers the fresher clip when all else is equal', () => {
  const now = Date.parse('2026-08-12T00:00:00Z');
  const base = { title: 'Fight Highlights', views: 10000 };

  const today = rank({ ...base, published: '2026-08-11T18:00:00Z' }, now);
  const lastWeek = rank({ ...base, published: '2026-08-04T18:00:00Z' }, now);
  assert.ok(today > lastWeek);
});

test('rank lets a much bigger clip beat a slightly fresher one', () => {
  const now = Date.parse('2026-08-12T00:00:00Z');

  const viral = rank(
    { title: 'Brutal Knockout Highlights', views: 5_000_000, published: '2026-08-10T00:00:00Z' },
    now,
  );
  const quiet = rank(
    { title: 'Fight Highlights', views: 500, published: '2026-08-11T00:00:00Z' },
    now,
  );
  assert.ok(viral > quiet);
});
