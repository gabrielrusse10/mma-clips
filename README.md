# MMA Clips

A website of recent MMA highlights — knockouts, submissions, free fights and finish reels — pulled
from the official YouTube channels of the major promotions and refreshed daily.

No API keys, no npm dependencies, no build step. A Node script writes one JSON file; the page reads
it.

## Run it

```bash
npm run update   # fetch the latest clips (needs internet)
npm start        # serve the site at http://localhost:8080
```

`npm run update` is the only thing that touches the network. `npm start` serves `site/` over HTTP —
you need the server rather than opening `index.html` directly, because browsers block `fetch()` on
`file://` URLs.

The repo ships with an empty data file, so **run `npm run update` first** or the page will tell you
there is nothing to show yet.

## Updating daily

Pick whichever fits how you run this.

**GitHub Actions (nothing to maintain).** `.github/workflows/update.yml` runs the crawl at 13:00 UTC
every day and commits the refreshed JSON. Pull to get the new clips. Trigger it by hand from the
Actions tab any time. Change the `cron:` line to move the time.

**cron (Linux/macOS).** Refresh every morning at 08:00 local:

```cron
0 8 * * * cd /path/to/mma-clips && /usr/bin/node scripts/update.mjs >> /tmp/mma-clips.log 2>&1
```

**launchd (macOS, survives sleep).** Save as
`~/Library/LaunchAgents/com.mmaclips.update.plist`, then `launchctl load` it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.mmaclips.update</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/mma-clips/scripts/update.mjs</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
```

## How it works

```
scripts/sources.json    the promotions to crawl
scripts/update.mjs      crawl -> filter -> site/data/highlights.json
scripts/lib/atom.mjs    parses YouTube's public Atom feeds
scripts/lib/classify.mjs decides what counts as a highlight
site/                   the website (index.html, app.js, styles.css, data/)
```

Each promotion's handle is resolved to a channel id once and cached in `scripts/channel-cache.json`,
then its public feed at `youtube.com/feeds/videos.xml` is read — the same feed an RSS reader would
use. Official channels post far more talk than fighting, so titles are scored against keyword lists
in `classify.mjs`: "Free Fight", "Best Knockouts" and "Fight Night Highlights" are kept, while
"Embedded, Ep. 3", "Press Conference" and "Official Weigh-In" are dropped. Surviving clips from the
last 45 days are ranked by a blend of recency, title confidence and view count.

A channel that fails is logged and skipped — one dead feed does not sink the run. If *every* source
fails, the script exits non-zero and leaves the existing data file alone rather than blanking the
site.

### Changing what gets crawled

Edit `scripts/sources.json`. Each entry needs an `id`, `name`, `handle` and `accent` colour; set
`"enabled": false` to skip one without deleting it. If a handle ever stops resolving, put the
channel id in directly:

```json
{ "id": "ufc", "name": "UFC", "channelId": "UC...", "accent": "#e11d2e", "enabled": true }
```

### Tuning the filter

`scripts/lib/classify.mjs` holds the keyword weights and the `HIGHLIGHT_THRESHOLD`. Lower the
threshold to let more through, raise it to be stricter. `tests/classify.test.mjs` pins the current
behaviour — add a title to the list there when you tune it.

## Tests

```bash
npm test
```

22 tests, all offline against a fixture feed in `tests/fixtures/`: feed parsing (CDATA, entities,
malformed entries), the highlight classifier, the 45-day cutoff, deduplication, ranking order, and
the fetch retry policy.

## Notes

Clips are embedded from the promotions' official YouTube channels via `youtube-nocookie.com`; all
rights belong to their respective owners. This reads public RSS feeds only — no scraping of the
site, no API quota, nothing to authenticate.
