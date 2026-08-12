#!/usr/bin/env node
/**
 * Daily crawl: read every promotion's YouTube feed, keep the fight footage,
 * and write the JSON the site renders from.
 *
 * Run with `npm run update`. Safe to run repeatedly - it is a full rebuild of
 * the data file, not an append.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isHighlight, rank, scoreTitle } from './lib/classify.mjs';
import { fetchChannelVideos, resolveChannelId } from './lib/youtube.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_FILE = path.join(ROOT, 'scripts', 'sources.json');
const CACHE_FILE = path.join(ROOT, 'scripts', 'channel-cache.json');
const OUTPUT_FILE = path.join(ROOT, 'site', 'data', 'highlights.json');

/** Videos older than this are dropped; the site is about recent action. */
const MAX_AGE_DAYS = 45;
/** Upper bound on the data file so the page stays fast to load. */
const MAX_ITEMS = 240;

async function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    console.warn(`! could not read ${path.basename(file)}: ${error.message}`);
    return fallback;
  }
}

/**
 * Collect videos from every enabled source.
 * A source that fails is reported and skipped - one dead channel must never
 * take down the whole update.
 */
async function collect(sources, cache) {
  const videos = [];
  const problems = [];
  const resolved = { ...cache };

  const results = await Promise.allSettled(
    sources.map(async (source, index) => {
      // Stagger the requests. Firing ten at once got the runner throttled,
      // and YouTube expresses that as a 404 on a perfectly live channel.
      await new Promise((resolve) => setTimeout(resolve, index * 900));

      const channelId = source.channelId || cache[source.id] || (await resolveChannelId(source.handle));
      if (!channelId) throw new Error(`could not resolve channel for ${source.handle}`);

      const result = await fetchChannelVideos(source, channelId);
      // Only cache an id that survived verification.
      resolved[source.id] = channelId;
      return result;
    }),
  );

  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'fulfilled') {
      videos.push(...result.value.videos);
      console.log(
        `  ${source.name.padEnd(20)} ${String(result.value.videos.length).padStart(3)} videos` +
          `  (${result.value.channelTitle})`,
      );
    } else {
      problems.push({ source: source.id, message: result.reason?.message ?? String(result.reason) });
      console.warn(`  ${source.name.padEnd(20)} FAILED - ${result.reason?.message ?? result.reason}`);
    }
  });

  return { videos, problems, resolved };
}

/**
 * Filter to recent fight footage, drop duplicates, and rank.
 *
 * `previous` carries the clips already on the site forward. Sources fail for
 * reasons that have nothing to do with the clips already published - a
 * throttled run once cut the feed from 25 clips to 5 - so the feed accumulates
 * and ages out by date rather than being rebuilt from whatever this one run
 * happened to reach.
 */
export function buildFeed(videos, now = Date.now(), previous = []) {
  const cutoff = now - MAX_AGE_DAYS * 86_400_000;
  const seen = new Set();

  const fresh = videos
    .filter((video) => isHighlight(video.title))
    .map((video) => ({
      id: video.videoId,
      title: video.title,
      published: video.published,
      source: video.sourceId,
      sourceName: video.sourceName,
      channel: video.channelTitle,
      thumbnail: video.thumbnail,
      views: video.views,
      score: scoreTitle(video.title).score,
    }));

  // Fresh entries win on collision: their view counts are the current ones.
  return [...fresh, ...previous]
    .filter((item) => Date.parse(item.published) >= cutoff)
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item) => ({ ...item, rank: Math.round(rank(item, now) * 100) / 100 }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_ITEMS);
}

async function main() {
  const config = await readJson(SOURCES_FILE, { sources: [] });
  const sources = (config.sources ?? []).filter((source) => source.enabled !== false);
  if (sources.length === 0) throw new Error('no enabled sources in scripts/sources.json');

  const cache = await readJson(CACHE_FILE, {});
  console.log(`Crawling ${sources.length} promotion channels...`);

  const { videos, problems, resolved } = await collect(sources, cache);
  if (videos.length === 0) {
    throw new Error('every source failed - refusing to overwrite the data file with nothing');
  }

  const existing = await readJson(OUTPUT_FILE, { items: [] });
  const items = buildFeed(videos, Date.now(), existing.items ?? []);
  const promotions = sources
    .filter((source) => items.some((item) => item.source === source.id))
    .map(({ id, name, accent }) => ({ id, name, accent }));

  const payload = {
    updated: new Date().toISOString(),
    counts: { scanned: videos.length, published: items.length, sources: promotions.length },
    promotions,
    items,
    ...(problems.length > 0 ? { problems } : {}),
  };

  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(CACHE_FILE, `${JSON.stringify(resolved, null, 2)}\n`);

  const added = items.filter((item) => !(existing.items ?? []).some((old) => old.id === item.id));
  console.log(
    `\nScanned ${videos.length} videos -> ${added.length} new, ` +
      `${items.length} clips live across ${promotions.length} promotions.`,
  );
  if (problems.length > 0) console.log(`${problems.length} source(s) had problems (see data file).`);
}

// Only run the crawl when invoked directly, so tests can import buildFeed.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`\nUpdate failed: ${error.message}`);
    process.exit(1);
  });
}
