# Daily update

Run `node scripts/daily.mjs` (no `npm install` needed) and act on its exit code. Read nothing else
first.

- **0**: done. Either the page is unchanged, or the script already applied the changes, committed
  and pushed. Reply with its last line and stop.
- **20**: some notices need judgement. The script printed them, and in
  `data/impacts.source.json` they carry a `"todo"` list. Fill in only those entries (below),
  delete their `"todo"`, then run `node scripts/daily.mjs --finish`. If that prints problems, fix
  them and run it again. Reply with its last line.
- **anything else**: reply with the error in one line. Don't push anything by hand.

## Filling in a `todo` entry

Everything copied from the page (dates, description, contacts, attachments) is already filled in;
leave it alone, along with every entry that has no `todo`. Keep the suggested `id`.

- `title`: short, sentence case, the problem without the building name: "Heating outage on the
  fourth floor of Wing 2", "Elevator car 71 out of service". Roads and lots may name themselves.
- `category`: check the guess. One of `hvac`, `steam`, `water`, `electrical`, `elevator`, `road`,
  `sidewalk`, `parking`, `fire-safety`, `construction`, `other`.
- `services`: 1–3 short tags for what people lose ("Air conditioning", "Elevator", "Road").
- `places`: the guess comes from names in the title and area; check it. One entry per building.
  Search with `node scripts/find-place.mjs <word>`. A place is an id string, or
  `{"label": "...", "point": [lng, lat]}`, or `{"label": "...", "geometry": <GeoJSON>}`.
- `precision`: `building` for whole buildings; `approximate` when you placed it roughly (add a
  one-line `locationNote` saying why); `exact` only if you traced the spot from an attached PNG
  map; `campus-wide` for the whole Purple Line (`line-purple-line`). For a road or lot closure,
  the whole road or lot with `approximate` is fine. Only open an attachment if it is a PNG and the
  closure is on a road, sidewalk or lot; never open PDFs.
- If the `todo` says the page retitled a notice or changed its area, check the title and places
  still fit and change only what doesn't.

Never guess dates or locations the notice doesn't give.
