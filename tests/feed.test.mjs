import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeed } from '../scripts/update.mjs';
import { fetchText } from '../scripts/lib/youtube.mjs';

const NOW = Date.parse('2026-08-12T00:00:00Z');

function video(overrides) {
  return {
    videoId: 'aaaaaaaaaaa',
    title: 'Fight Night Highlights',
    published: '2026-08-11T00:00:00Z',
    channelTitle: 'Test Promotion',
    thumbnail: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
    views: 1000,
    sourceId: 'test',
    sourceName: 'Test Promotion',
    ...overrides,
  };
}

test('drops anything that is not fight footage', () => {
  const items = buildFeed([video(), video({ videoId: 'bbbbbbbbbbb', title: 'Press Conference' })], NOW);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'aaaaaaaaaaa');
});

test('drops clips older than the 45 day window', () => {
  const items = buildFeed(
    [
      video({ videoId: 'fresh1111111', published: '2026-08-01T00:00:00Z' }),
      video({ videoId: 'stale1111111', published: '2026-05-01T00:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(items.map((i) => i.id), ['fresh1111111']);
});

test('dedupes videos that appear on more than one channel', () => {
  const items = buildFeed(
    [video(), video({ sourceId: 'other', sourceName: 'Other Promotion' })],
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].source, 'test');
});

test('orders by rank, highest first', () => {
  const items = buildFeed(
    [
      video({ videoId: 'quiet1111111', views: 100, published: '2026-08-01T00:00:00Z' }),
      video({ videoId: 'viral1111111', views: 4_000_000, published: '2026-08-11T00:00:00Z' }),
    ],
    NOW,
  );
  assert.deepEqual(items.map((i) => i.id), ['viral1111111', 'quiet1111111']);
  assert.ok(items[0].rank > items[1].rank);
});

test('emits exactly the fields the page reads', () => {
  const [item] = buildFeed([video()], NOW);
  assert.deepEqual(Object.keys(item).sort(), [
    'channel',
    'id',
    'published',
    'rank',
    'score',
    'source',
    'sourceName',
    'thumbnail',
    'title',
    'views',
  ]);
});

test('an empty crawl yields an empty list rather than an error', () => {
  assert.deepEqual(buildFeed([], NOW), []);
});

test('fetchText retries a 500 and then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 2) return { ok: false, status: 500, text: async () => '' };
    return { ok: true, status: 200, text: async () => 'body' };
  };

  const body = await fetchText('https://example.test/feed', { fetchImpl, attempts: 3 });
  assert.equal(body, 'body');
  assert.equal(calls, 2);
});

test('fetchText gives up immediately on a 404', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: false, status: 404, text: async () => '' };
  };

  await assert.rejects(
    () => fetchText('https://example.test/missing', { fetchImpl, attempts: 3 }),
    /HTTP 404/,
  );
  assert.equal(calls, 1, 'a 404 will not fix itself, so it must not be retried');
});
