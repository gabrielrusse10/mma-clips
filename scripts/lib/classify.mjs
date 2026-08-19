/**
 * Decides whether a video from a promotion's channel is fight footage.
 *
 * Official channels post far more talk than fighting - pressers, embedded
 * vlogs, weigh-ins, podcasts - so titles are scored rather than trusted.
 *
 * Two lessons from real feeds shaped this:
 *
 * 1. A hard negative must not be outvoted. "UFC 330 Embedded: Vlog Series" is
 *    never a highlight, whatever else the title says. Conversely a mild word
 *    like "Episode" must not sink a genuine one - "Jaw-Dropping Highlights
 *    From Contender Series Episode 1" is exactly what people came for.
 * 2. The promotions do not all post in English. RIZIN posts Japanese, KSW
 *    Polish, OKTAGON Czech, so those carry their own keywords.
 */

/** Never a highlight, regardless of anything else in the title. */
const HARD_NEGATIVE = [
  /\bpress conference\b/,
  /\bpresser\b/,
  /\bweigh[- ]?ins?\b/,
  /\bembedded\b/,
  /\bvlog\b/,
  /\bmedia day\b/,
  /\bopen workouts?\b/,
  /\bface ?offs?\b/,
  /\bstare ?downs?\b/,
  /\binterviews?\b/,
  /\bpodcast\b/,
  /\bpost[- ]fight show\b/,
  /\bcountdown\b/,
  /\bpredictions?\b/,
  /\bhow to watch\b/,
  /\bwatch along\b/,
  /\bceremonial\b/,
  /\barrivals?\b/,
  /\bbehind the scenes\b/,
  /\btrailer\b/,
  /\bmerch\b/,
  /\btrash ?talk\b/,
  // Japanese: interview, press conference, weigh-in, fly-on-the-wall, wrap-up
  /インタビュー/,
  /記者会見/,
  /計量/,
  /密着/,
  /総括/,
  /舞台裏/,
  /公開練習/,
  // Polish / Czech: conference, weigh-in, interview
  /\bkonferencja\b/,
  /\bwa[żz]enie\b/,
  /\bwywiad\b/,
  /\bkonference\b/,
  /\bv[áa][žz][eí]n[íi]\b/,
  /\brozhovor\b/,
];

/** Title phrases that mark real fight footage. Weight reflects confidence. */
const POSITIVE = [
  [/\bhighlights?\b/, 5],
  [/\bknock ?outs?\b/, 5],
  [/\bko'?s?\b/, 4],
  [/\bsubmissions?\b/, 5],
  [/\bfinish(es|ed)?\b/, 4],
  [/\bfree fight\b/, 5],
  [/\bfull fight\b/, 5],
  [/\bmain event\b/, 4],
  [/\bfull (event|card)\b/, 3],
  [/\bmain card\b/, 3],
  [/\bcompilation\b/, 3],
  [/\bbest of\b/, 3],
  [/\btop \d+\b/, 3],
  [/\bevery finish\b/, 4],
  [/\bslugfest\b/, 3],
  [/\bwalk ?off\b/, 3],
  [/\bflying knee\b/, 3],
  [/\bhead ?kick\b/, 3],
  [/\bguillotine\b/, 3],
  [/\brear ?naked ?choke\b/, 3],
  [/\barm ?bar\b/, 3],
  [/\bcomeback\b/, 2],
  [/\bbrutal\b/, 2],
  [/\bround \d\b/, 2],
  [/\bvs\.?[\s.]/, 3],
  // Japanese: highlight, bout, "bout N", finish, full fight
  [/ハイライト/, 5],
  [/試合/, 3],
  [/第\d+試合/, 2],
  [/フィニッシュ/, 4],
  [/全試合/, 3],
  // Polish: fight, whole fight, knockout, recap
  [/\bwalka\b/, 4],
  [/\bca[łl]a walka\b/, 5],
  [/\bnokaut\b/, 5],
  [/\bskr[óo]t\b/, 4],
  // Czech: bout, whole bout
  [/\bz[áa]pas\b/, 4],
  [/\bcel[ýy] z[áa]pas\b/, 5],
];

/** Mild signals against - enough to break a tie, not enough to veto. */
const SOFT_NEGATIVE = [
  [/\bepisode \d+\b/, 2],
  [/\bpreview\b/, 3],
  [/\bbreakdown\b/, 3],
  [/\bannouncement\b/, 3],
  [/\blive stream\b/, 3],
  [/\bcommentary\b/, 2],
  [/\bpromo\b/, 3],
];

/**
 * Bellator writes matchups as "Chandler v Henderson". A bare "v" needs a
 * capitalised name on *both* sides, or it fires on ordinary prepositions:
 * Czech "znovu v kleci" ("in the cage again") and "jízda v Brně" ("a ride in
 * Brno") are not fight videos, and the second one has a capital after the v.
 * Tested against the original title, since case is the whole signal.
 */
const MATCHUP = /\p{Lu}[\p{L}'’-]*\s+v\.?\s+\p{Lu}/u;

/** Score a title. `hardStop` means it was vetoed outright. */
export function scoreTitle(title) {
  const raw = String(title ?? '');
  const text = raw.toLowerCase();
  if (!text) return { score: 0, matched: [], hardStop: false };

  if (HARD_NEGATIVE.some((pattern) => pattern.test(text))) {
    return { score: 0, matched: [], hardStop: true };
  }

  let score = 0;
  const matched = [];

  if (MATCHUP.test(raw)) {
    score += 3;
    matched.push(MATCHUP.source);
  }
  for (const [pattern, weight] of POSITIVE) {
    if (pattern.test(text)) {
      score += weight;
      matched.push(pattern.source);
    }
  }
  for (const [pattern, weight] of SOFT_NEGATIVE) {
    if (pattern.test(text)) score -= weight;
  }

  return { score, matched, hardStop: false };
}

const HIGHLIGHT_THRESHOLD = 3;

/** True when the title looks like fight footage rather than promo content. */
export function isHighlight(title) {
  const { score, hardStop } = scoreTitle(title);
  return !hardStop && score >= HIGHLIGHT_THRESHOLD;
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
