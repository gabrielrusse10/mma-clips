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

test('negative phrases outweigh an incidental positive word', () => {
  // "Highlights" appears, but this is still a talk show.
  assert.equal(isHighlight('Post-Fight Show: Highlights and Reaction'), false);
  assert.equal(isHighlight('Press Conference Highlights'), false);
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
