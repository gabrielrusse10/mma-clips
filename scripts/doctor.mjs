#!/usr/bin/env node
/**
 * Health check for scripts/sources.json: `npm run doctor`.
 *
 * Resolves every source and reports which channel it actually landed on, so a
 * handle that quietly points at a regional, fan-run or rebranded channel shows
 * up as a mismatch instead of as mislabelled clips on the site.
 *
 * Probe arbitrary handles too, which is how you find the right one:
 *   node scripts/doctor.mjs @RIZINFF @rizin_official
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseChannelFeed, parseFeedTitle } from './lib/atom.mjs';
import { fetchText, resolveChannelId } from './lib/youtube.mjs';
import { isHighlight, scoreTitle } from './lib/classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

async function describe(label, handleOrId, verify) {
  const channelId = /^UC[\w-]{20,}$/.test(handleOrId)
    ? handleOrId
    : await resolveChannelId(handleOrId);

  if (!channelId) return { label, handleOrId, ok: false, note: 'handle did not resolve' };

  try {
    const xml = await fetchText(FEED_URL + channelId);
    const title = parseFeedTitle(xml);
    const videos = parseChannelFeed(xml);
    const highlights = videos.filter((v) => isHighlight(v.title)).length;
    const ok = !verify || title.toLowerCase().includes(verify.toLowerCase());

    return {
      label,
      handleOrId,
      channelId,
      title,
      videos: videos.length,
      highlights,
      ok,
      note: ok ? '' : `expected a title matching "${verify}"`,
      titles: videos.map((v) => ({ title: v.title, score: scoreTitle(v.title).score })),
    };
  } catch (error) {
    return { label, handleOrId, channelId, ok: false, note: error.message };
  }
}

const args = process.argv.slice(2);
// --titles prints every video title with its score, which is how you tune the
// keyword weights in classify.mjs against what the channels really post.
const showTitles = args.includes('--titles');
const extra = args.filter((arg) => arg !== '--titles');
const config = JSON.parse(await readFile(path.join(ROOT, 'scripts', 'sources.json'), 'utf8'));

const jobs = extra.length
  ? extra.map((handle) => describe('probe', handle))
  : config.sources.map((s) => describe(s.name, s.channelId || s.handle, s.verify));

const rows = await Promise.all(jobs);

console.log(
  `${'SOURCE'.padEnd(18)}${'CHANNEL TITLE'.padEnd(30)}${'ID'.padEnd(26)}VIDEOS  CLIPS  OK`,
);
for (const row of rows) {
  console.log(
    `${String(row.label).padEnd(18)}${String(row.title ?? '-').slice(0, 29).padEnd(30)}` +
      `${String(row.channelId ?? '-').padEnd(26)}${String(row.videos ?? 0).padStart(6)}` +
      `${String(row.highlights ?? 0).padStart(7)}  ${row.ok ? 'yes' : 'NO'}` +
      `${row.note ? `  <- ${row.note}` : ''}`,
  );
}

if (showTitles) {
  for (const row of rows) {
    if (!row.titles?.length) continue;
    console.log(`\n--- ${row.label}: ${row.title} ---`);
    for (const { title, score } of row.titles) {
      console.log(`  ${isHighlight(title) ? 'KEEP' : 'drop'} ${String(score).padStart(3)}  ${title}`);
    }
  }
}

const bad = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - bad.length}/${rows.length} sources healthy.`);
if (bad.length > 0 && extra.length === 0) process.exitCode = 1;
