# UMD Service Impacts

A map of the outages, road closures and elevator work that University of Maryland Facilities
Management posts at <https://facilities.umd.edu/info-resources/service-impacts>. Unofficial.

The page isn't machine-readable, so an LLM reads it once a day and writes structured data
(`data/impacts.source.json`); the site itself never changes. Instructions for that daily run are in
[`PROMPT.md`](PROMPT.md).

## How it fits together

```
facilities.umd.edu ──scripts/daily.mjs──▶ unchanged? stop.
                                         │  dates, text, removals: applied by the script
                                         │  new notices only: title, category, places (PROMPT.md)
                                         ▼
                             data/impacts.source.json
                                         │  npm run data: resolve places, validate
reference/places.json ──────────────────▶│
 (building outlines, lots, roads,        ▼
  Purple Line from OpenStreetMap) public/data/impacts.json ──▶ the site (fetches it at runtime)
```

- **`reference/places.json`**: every place a notice can point at, with its outline. Built by
  `scripts/build_gazetteer.py` from OpenStreetMap (Overpass) plus building numbers and codes from
  api.umd.io. Rebuild only when campus changes.
- **`scripts/compile.mjs`** (`npm run data`): turns place ids into geometry and rejects bad data
  (unknown places, off-campus coordinates, dates without an Eastern offset, unknown categories). It
  runs first in `npm run build`, so a broken update fails the deploy instead of breaking the site.
- **The site** (`src/`): Vite, React, Tailwind and shadcn/ui, with MapLibre GL and CARTO's free
  basemaps. Status ("In effect", "Upcoming", "Ended") is computed in the browser from the dates, so
  the map stays right between updates. Each notice has a link (`/#<id>`).

## Commands

```sh
npm install
npm run dev                  # http://localhost:5173
npm run daily                # the daily update (see PROMPT.md)
npm run -s fetch             # today's notices as JSON
npm run place -- toll        # look up place ids
npm run data                 # compile and validate data
npm run build                # data + typecheck + production build into dist/
python3 scripts/build_gazetteer.py            # rebuild reference/places.json from OSM
```

## Daily updates

A Claude Code routine wakes an updater session once a day. It runs `node scripts/daily.mjs`,
which compares the page with the last run (`data/page-rows.json`). If nothing changed it only
records the check time (`data/checked.json`, shown on the site as "Checked …") and stops.
Otherwise the script applies every change it can decide by rule (dates, descriptions, resolved
notices, removals) and pushes to `main`; only brand-new notices need the model, for a title, a
category and the places, which the script has already guessed. To run it by hand, open the
repository in Claude Code and type `/update`.

## Deploying

Vercel, from this repository: every push to `main` deploys <https://umd-service-impacts.vercel.app>,
and every other branch gets a preview. `vercel.json` makes browsers revalidate `/data/*` on every
visit and cache the hashed assets for a year.

## License and data

Code: MIT (see `LICENSE`). Notices: University of Maryland Facilities Management; this site is
unofficial and not affiliated with the university. Building outlines, lots and roads: ©
OpenStreetMap contributors, ODbL. Basemap: CARTO.
