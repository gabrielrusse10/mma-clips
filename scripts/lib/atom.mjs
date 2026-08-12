/**
 * Minimal Atom reader for YouTube channel feeds.
 *
 * YouTube's feed is small, flat and machine-generated, so a tag scanner is
 * enough here and keeps the project dependency-free. It is deliberately
 * forgiving: anything it cannot understand is skipped rather than thrown.
 */

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode XML entities, including numeric and hex escapes. */
export function decodeEntities(value) {
  if (!value || !value.includes('&')) return value ?? '';
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}

function stripCdata(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('<![CDATA[') && trimmed.endsWith(']]>')
    ? trimmed.slice(9, -3)
    : trimmed;
}

/** Text content of the first `<tag>...</tag>` in `xml`, or '' when absent. */
export function tagText(xml, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeEntities(stripCdata(match[1])) : '';
}

/** Value of `attr` on the first `<tag ...>` element, or '' when absent. */
export function tagAttr(xml, tag, attr) {
  const element = new RegExp(`<${tag}(\\s[^>]*?)/?>`).exec(xml);
  if (!element) return '';
  const found = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`).exec(element[1]);
  return found ? decodeEntities(found[1]) : '';
}

/** All `<entry>` blocks in document order. */
export function splitEntries(xml) {
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function toIsoDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : '';
}

/**
 * Parse a YouTube channel feed into plain video records.
 * Entries missing an id, title or usable date are dropped.
 */
export function parseChannelFeed(xml) {
  if (typeof xml !== 'string' || !xml.includes('<entry')) return [];

  return splitEntries(xml)
    .map((entry) => {
      const videoId = tagText(entry, 'yt:videoId');
      const title = tagText(entry, 'media:title') || tagText(entry, 'title');
      const published = toIsoDate(tagText(entry, 'published'));
      if (!/^[\w-]{6,20}$/.test(videoId) || !title || !published) return null;

      return {
        videoId,
        title,
        published,
        channelId: tagText(entry, 'yt:channelId'),
        channelTitle: tagText(entry, 'name'),
        description: tagText(entry, 'media:description'),
        thumbnail:
          tagAttr(entry, 'media:thumbnail', 'url') ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        views: toInt(tagAttr(entry, 'media:statistics', 'views')),
      };
    })
    .filter(Boolean);
}

/** Pull the canonical channel id out of a YouTube channel page. */
export function extractChannelId(html) {
  if (typeof html !== 'string') return '';
  const patterns = [
    /"channelId"\s*:\s*"(UC[\w-]{20,})"/,
    /"externalId"\s*:\s*"(UC[\w-]{20,})"/,
    /channel\/(UC[\w-]{20,})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return match[1];
  }
  return '';
}
