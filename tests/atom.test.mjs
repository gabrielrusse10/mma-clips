import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decodeEntities,
  extractChannelId,
  parseChannelFeed,
  parseFeedTitle,
} from '../scripts/lib/atom.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const feed = await readFile(path.join(HERE, 'fixtures', 'channel-feed.xml'), 'utf8');

test('parses every well-formed entry and drops the malformed one', () => {
  const videos = parseChannelFeed(feed);
  assert.equal(videos.length, 4);
  assert.deepEqual(
    videos.map((v) => v.videoId),
    ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'],
  );
});

test('reads the fields the site renders', () => {
  const [first] = parseChannelFeed(feed);
  assert.equal(first.title, 'Free Fight: Jones vs Gustafsson 2 | Full Fight Highlights');
  assert.equal(first.published, '2026-08-10T18:00:00.000Z');
  assert.equal(first.channelId, 'UCtestchannelid00000');
  assert.equal(first.channelTitle, 'Test Promotion');
  assert.equal(first.thumbnail, 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg');
  assert.equal(first.views, 1250000);
});

test('unwraps CDATA titles', () => {
  const cdata = parseChannelFeed(feed).find((v) => v.videoId === 'ccccccccccc');
  assert.equal(cdata.title, 'Best Knockouts of 2026 So Far — "Brutal" Finishes');
});

test('decodes entities in titles and descriptions', () => {
  const weighIn = parseChannelFeed(feed).find((v) => v.videoId === 'ddddddddddd');
  assert.equal(weighIn.title, 'Test 299 Official Weigh-In & Ceremonial Face Offs');

  const [first] = parseChannelFeed(feed);
  assert.equal(first.description, 'A rematch for the ages & one of the best ever.');
});

test('decodeEntities handles named, decimal and hex escapes', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&#65;&#66;'), 'AB');
  assert.equal(decodeEntities('&#x2014;'), '—');
  assert.equal(decodeEntities('&notreal; stays'), '&notreal; stays');
});

test('reads the channel title, not the first entry title', () => {
  assert.equal(parseFeedTitle(feed), 'Test Promotion');
  assert.equal(parseFeedTitle(''), '');
});

test('returns an empty list for junk input rather than throwing', () => {
  assert.deepEqual(parseChannelFeed(''), []);
  assert.deepEqual(parseChannelFeed('<html>not a feed</html>'), []);
  assert.deepEqual(parseChannelFeed(null), []);
});

const OWNER = 'UCvgfXK4nTYKudb0rFR6noLA';
const OTHER = 'UCaaaaaaaaaaaaaaaaaaaaaa';

test('extracts a channel id from the shapes YouTube pages use', () => {
  assert.equal(
    extractChannelId(`<link rel="canonical" href="https://www.youtube.com/channel/${OWNER}">`),
    OWNER,
  );
  assert.equal(extractChannelId(`<meta itemprop="identifier" content="${OWNER}">`), OWNER);
  assert.equal(extractChannelId(`"externalId":"${OWNER}"`), OWNER);
  assert.equal(extractChannelId('nothing here'), '');
});

test('prefers the page owner over channels merely mentioned on the page', () => {
  // Real channel pages list recommended channels by id. Picking the first
  // "channelId" match is how a crawl ends up on somebody else's channel.
  const html = `
    <html><head>
      <link rel="canonical" href="https://www.youtube.com/channel/${OWNER}">
    </head><body>
      {"channelId":"${OTHER}","title":"Some recommended channel"}
      {"externalId":"${OWNER}"}
    </body></html>`;
  assert.equal(extractChannelId(html), OWNER);
});

test('ignores a page that only mentions other channels', () => {
  assert.equal(extractChannelId(`{"channelId":"${OTHER}"}`), '');
});
