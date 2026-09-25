# UMD Service Impacts

A map of the outages, road closures and elevator work that University of Maryland Facilities
Management posts at <https://facilities.umd.edu/info-resources/service-impacts>. Unofficial.

The page isn't machine-readable, so an LLM reads it once a day and writes structured data
(`data/impacts.source.json`); the site itself never changes. Instructions for that daily run are in
[`PROMPT.md`](PROMPT.md).

## How it fits together

```
facilities.umd.edu ──npm run fetch──▶ rows (JSON)
                                         │  LLM: titles, categories, dates, places   (PROMPT.md)
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
npm run fetch                # today's notices as JSON
npm run place -- toll        # look up place ids
npm run data                 # compile and validate data
npm run build                # data + typecheck + production build into dist/
python3 scripts/build_gazetteer.py            # rebuild reference/places.json from OSM
```

## Daily updates

A Claude Code routine runs once a day in a fresh cloud session. It uses the `daily-update` agent
(`.claude/agents/daily-update.md`, on Opus), which follows `PROMPT.md` and pushes the new data to
`main`. To run it by hand, open the repository in Claude Code and type `/update`.

## Deploying

Vercel, from this repository: every push to `main` deploys <https://umd-service-impacts.vercel.app>,
and every other branch gets a preview. `vercel.json` makes browsers revalidate `/data/*` on every
visit and cache the hashed assets for a year.

## License and data

Code: MIT (see `LICENSE`). Notices: University of Maryland Facilities Management; this site is
unofficial and not affiliated with the university. Building outlines, lots and roads: ©
OpenStreetMap contributors, ODbL. Basemap: CARTO.
