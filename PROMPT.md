# Daily update

You are updating the data behind a map of University of Maryland service impacts (outages, road
closures, elevator work). The website never changes; only `data/impacts.source.json` does. Your
job is to make that file match what Facilities Management lists today, then commit and push.
Pushing to `main` deploys the site.

The page is written for people, not machines. Titles mix building, room and problem; dates are in
local time; locations are often "see attached map". You'll need to make judgement calls. Make them
the way a careful local would, and never make up a fact the notice doesn't give.

## Steps

1. `npm ci` (first run only), then `npm run -s fetch > /tmp/rows.json` (`-s` keeps npm's own banner out of the JSON). This prints every table row on
   https://facilities.umd.edu/info-resources/service-impacts as JSON. Each row has:
   - `existingId`: the id the notice already has in our file, or `null` if it is new;
   - `noLongerListed`: ids in our file that the page no longer shows.

   If it exits with "No rows found", the page layout changed: read the page yourself (curl it) and
   carry on by hand, and mention it in the commit message.
2. Edit `data/impacts.source.json` so it mirrors the page:
   - **Keep** every row whose `existingId` is set. Update its fields if the page changed them (dates,
     description, attachments, a `***Resolved***` prefix). Keep its `id` and its `places` unless the
     location itself changed.
   - **Add** a new entry for every row with `existingId: null` (see "Writing an entry").
   - **Remove** every entry in `noLongerListed`. The page is the source of truth; the site already
     greys out notices whose end time has passed, so don't remove anything just because it ended.
   - Set `fetchedAt` to the current time in `America/New_York`, with its offset
     (e.g. `2026-09-25T06:30:00-04:00`). Do this even when nothing else changed: the site shows it
     as "Checked …" and flags data older than 36 hours.
3. `npm run data`. It resolves places and checks every field. Fix whatever it reports and rerun
   until it prints ✓.
4. `npm run build` must succeed.
5. If `git diff` shows changes, commit with a message like `Update notices: +2 new, 1 removed
   (2026-09-25)` and push to `main`. If only `fetchedAt` changed, commit `Checked notices
   (2026-09-25)` anyway.

## Writing an entry

Look at two or three existing entries first and match their style. Fields:

| Field | What to put |
|---|---|
| `id` | kebab-case, stable forever: `<place>-<what>`, e.g. `hornbake-4th-floor-heating`. Never reuse an id for a different notice. |
| `title` | A short sentence-case summary of the problem **without the building name** (the site shows places separately): "Heating outage on the fourth floor of Wing 2", "Elevator car 71 out of service", "Fieldhouse Drive closed for excavation". Roads and lots may name themselves. No "Urgent Outage Notification:", no dates. |
| `sourceTitle` | The row's `title`, exactly as the page has it, minus any `***Resolved***` marker. |
| `section` | The row's `section`. |
| `category` | The main thing affected: `hvac` (heating, cooling, air conditioning, ventilation), `steam`, `water` (domestic water, hot water on its own), `electrical`, `elevator`, `road`, `sidewalk`, `parking`, `fire-safety` (alarm and sprinkler testing), `construction` (painting, roofing, flooring, noise, laydown), `other`. |
| `services` | 1–3 short tags for what people lose: "Heating", "Air conditioning", "Steam", "Domestic hot water", "Elevator", "Road", "Sidewalk", "Parking", "Noise", "Fire alarms", "Lab access"… |
| `notice` | The row's `impactType` lowercased (`planned` / `emergency` / `unplanned`). One exception: if the title says "Urgent Outage Notification" **and** the description calls the repair an emergency, use `emergency` even when the column says Planned. |
| `resolved` | `true` only if the title carries `***Resolved***` (or similar). |
| `start`, `end` | ISO 8601 with the Eastern offset of **that date**: `-04:00` from the second Sunday in March to the first Sunday in November, `-05:00` otherwise. Page format is `MM-DD-YYYY h:mm am`. A blank finish is `null` ("no end date posted"); never guess one. |
| `area` | The row's `area`, lightly cleaned (drop `**SEE MAP ATTACHED**`-style shouting; keep the facts in it). |
| `repairType`, `description` | From the row. Fix obvious typos ("Plaz/Sidewalk" → "Plaza/Sidewalk"); otherwise keep the wording. If the description only repeats the repair type, write one plain sentence from the title instead. |
| `contacts` | Names from `contact`, split on commas. |
| `phone` | The row's phone. |
| `attachments` | The row's `attachments` (absolute URLs, as printed). |
| `places` | Where it is. See below. At least one. |
| `precision` | `exact` (you drew the precise spot from an attached map), `building` (whole-building references), `approximate` (you placed it roughly), `campus-wide` (a long corridor or many places). Approximate and campus-wide draw dashed. |
| `locationNote` | Optional, one or two sentences a reader needs about the location: what stays open, why it's approximate. |

### Places

A place is one of:

```jsonc
"building-hornbake-library"                                   // a reference, by id
{ "ref": "road-fraternity-row" }                              // the same, as an object
{ "label": "Work site in front of Greek House 2", "point": [-76.93632, 38.98443] }
{ "label": "Fieldhouse Drive excavation area", "geometry": { "type": "LineString", "coordinates": [[...], ...] } }
```

- Coordinates are `[longitude, latitude]` (longitude is about -76.94 on campus). `npm run data`
  rejects anything off campus.
- Find ids with `npm run place -- <words>`: `npm run place -- toll physics`, `npm run place -- lot 16`,
  `npm run place -- purple`. Kinds are `building-*`, `parking-*`, `road-*` and `line-purple-line`.
  Buildings carry their old names and codes as aliases (Kirwan Hall is also "Mathematics Building",
  MTH, 084). Names on the page can be old or shortened; search on the distinctive word.
- A notice about several buildings gets one place per building.
- For roads, sidewalks and lot closures, **open the attachment** when there is one (PNG: view it;
  PDF: read it) and draw just the closed segment or area as a custom `LineString`/`Polygon`, using
  the road or lot geometry in `reference/places.json` for coordinates. If the drawing isn't precise
  enough to trace, use the whole road or lot with `precision: "approximate"` and say so in
  `locationNote`.
- Purple Line notices that cover the whole alignment use `line-purple-line` with `precision:
  "campus-wide"`.
- If a place is genuinely missing from the gazetteer (a new building, say), give it a custom `point`
  at the building's location rather than guessing a similar name.

## Don'ts

- Don't edit anything outside `data/` unless the build is broken by something you understand.
- Don't touch `reference/places.json` by hand. `python3 scripts/build_gazetteer.py` rebuilds it from
  OpenStreetMap when campus changes; only do that when a needed building is missing, and review the diff.
- Don't copy notices from anywhere but the Facilities Management page.
