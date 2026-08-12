/**
 * Decides whether a video from a promotion's channel is fight footage.
 *
 * Official channels post far more talk than fighting - pressers, embedded
 * vlogs, weigh-ins, podcasts. Scoring on the title keeps the feed watchable
 * without needing to inspect the video itself.
 */

/** Title phrases that mark real fight footage. Weight reflects confidence. */
const POSITIVE = [
  [/\bhighlights?\b/, 5],
  [/\bknock ?outs?\b/, 5],
  [/\bko'?s?\b/, 4],
  [/\bsubmissions?\b/, 5],
  [/\bfinishes?\b/, 4],
  [/\bfree fight\b/, 5],
  [/\bfull fight\b/, 5],
  [/\bbest of\b/, 3],
  [/\btop \d+\b/, 3],
  [/\bfight night highlights\b/, 5],
  [/\bevery finish\b/, 4],
  [/\bbrutal\b/, 2],
  [/\bviolent\b/, 2],
  [/\bslugfest\b/, 3],
  [/\bwar\b/, 1],
  [/\bcomeback\b/, 2],
  [/\bwalk ?off\b/, 3],
  [/\bflying knee\b/, 3],
  [/\bhead ?kick\b/, 3],
  [/\bguillotine\b/, 3],
  [/\brear ?naked ?choke\b/, 3],
  [/\barm ?bar\b/, 3],
  [/\bvs\.?\s/, 2],
  [/\bround \d\b/, 2],
];

/** Title phrases that mark everything that is not fighting. */
const NEGATIVE = [
  [/\bpress conference\b/, 10],
  [/\bpresser\b/, 10],
  [/\bweigh[- ]?ins?\b/, 10],
  [/\bembedded\b/, 10],
  [/\bvlog\b/, 10],
  [/\bepisode \d+\b/, 6],
  [/\bmedia day\b/, 10],
  [/\bopen workouts?\b/, 10],
  [/\bface ?offs?\b/, 8],
  [/\bstare ?downs?\b/, 6],
  [/\binterviews?\b/, 8],
  [/\bpodcast\b/, 10],
  [/\bpost[- ]fight show\b/, 8],
  [/\bcountdown\b/, 7],
  [/\bpreview\b/, 7],
  [/\bpredictions?\b/, 8],
  [/\bbreakdown\b/, 5],
  [/\btrailer\b/, 7],
  [/\bpromo\b/, 7],
  [/\bceremonial\b/, 9],
  [/\bofficial weigh\b/, 10],
  [/\barrivals?\b/, 6],
  [/\bbehind the scenes\b/, 6],
  [/\bannouncement\b/, 6],
  [/\bfull card\b/, 3],
  [/\bhow to watch\b/, 8],
  [/\blive stream\b/, 6],
  [/\bwatch along\b/, 8],
  [/\bcommentary\b/, 4],
  [/\bmerch\b/, 8],
  [/\bshorts?\b/, 2],
];

/** Score a title; positive weights mean fight footage, negative mean talk. */
export function scoreTitle(title) {
  const text = String(title ?? '').toLowerCase();
  let score = 0;
  const matched = [];

  for (const [pattern, weight] of POSITIVE) {
    if (pattern.test(text)) {
      score += weight;
      matched.push(pattern.source);
    }
  }
  for (const [pattern, weight] of NEGATIVE) {
    if (pattern.test(text)) score -= weight;
  }

  return { score, matched };
}

const HIGHLIGHT_THRESHOLD = 3;

/** True when the title looks like fight footage rather than promo content. */
export function isHighlight(title) {
  return scoreTitle(title).score >= HIGHLIGHT_THRESHOLD;
}

/**
 * Ranking value combining freshness, title confidence and viewership.
 *
 * Recency dominates - this is a "what happened lately" feed - but a runaway
 * knockout from last week should still outrank a quiet clip from today.
 */
export function rank(video, now = Date.now()) {
  const ageHours = Math.max(0, (now - Date.parse(video.published)) / 3_600_000);
  const freshness = 100 / (1 + ageHours / 24);
  const confidence = scoreTitle(video.title).score * 2;
  const popularity = Math.log10(1 + (video.views || 0)) * 4;
  return freshness + confidence + popularity;
}
