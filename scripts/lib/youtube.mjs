/**
 * Fetching side of the crawl: resolve channel handles to ids, then read each
 * channel's public Atom feed. No API key and no third-party dependencies.
 */

import { extractChannelId, parseChannelFeed, parseFeedTitle } from './atom.mjs';

const USER_AGENT =
  'mma-clips/1.0 (+https://github.com/gabrielrusse10/mma-clips) static-site-generator';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

/** GET with a timeout and a couple of retries for transient network faults. */
export async function fetchText(url, { attempts = 4, timeoutMs = 20_000, fetchImpl = fetch } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, 'accept-language': 'en-US,en;q=0.9' },
      });
      if (!response.ok) {
        // YouTube answers 404 for a feed when it is throttling the caller, not
        // only when the channel is gone - a burst of requests turned six live
        // channels into 404s mid-run. Retry those; a genuinely dead channel
        // just fails a little slower.
        const retryable = response.status >= 500 || response.status === 429 || response.status === 404;
        throw Object.assign(new Error(`HTTP ${response.status} for ${url}`), { retryable });
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      const retryable = error.retryable || error.name === 'AbortError' || error.name === 'TypeError';
      if (!retryable || attempt === attempts) break;
      // Back off generously: throttling clears in seconds, and the crawl has
      // no deadline worth rushing for.
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/**
 * Turn a channel handle such as `@UFC` into a `UC...` channel id.
 * Tries the handle URL first, then the legacy /c/ and /user/ paths.
 */
export async function resolveChannelId(handle, options = {}) {
  const name = String(handle).replace(/^@/, '');
  const candidates = [
    `https://www.youtube.com/@${name}`,
    `https://www.youtube.com/c/${name}`,
    `https://www.youtube.com/user/${name}`,
  ];

  for (const url of candidates) {
    try {
      const channelId = extractChannelId(await fetchText(url, options));
      if (channelId) return channelId;
    } catch {
      // Try the next URL shape.
    }
  }
  return '';
}

/**
 * Read one channel's feed and tag every video with its promotion.
 *
 * `source.verify` guards against landing on the wrong channel: promotions get
 * bought, rebranded and merged, and handles follow them. Labelling PFL's clips
 * as Bellator is worse than dropping the source, so a title mismatch throws.
 */
export async function fetchChannelVideos(source, channelId, options = {}) {
  const xml = await fetchText(FEED_URL + channelId, options);
  const channelTitle = parseFeedTitle(xml);

  if (source.verify && !channelTitle.toLowerCase().includes(source.verify.toLowerCase())) {
    throw new Error(
      `${channelId} is "${channelTitle}", expected a channel matching "${source.verify}"`,
    );
  }

  return {
    channelTitle,
    videos: parseChannelFeed(xml).map((video) => ({
      ...video,
      sourceId: source.id,
      sourceName: source.name,
    })),
  };
}
