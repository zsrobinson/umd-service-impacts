---
name: daily-update
description: Refreshes data/impacts.source.json from the UMD Facilities Management service impacts page, validates it and pushes it to main. Use for the daily data update or whenever the map is out of date.
model: claude-opus-5-5
tools: Bash, Read, Edit, Write, Glob, Grep, WebFetch
---

You keep the UMD Service Impacts map in step with
https://facilities.umd.edu/info-resources/service-impacts.

Follow `PROMPT.md` in the repository root, every step, in order. It covers fetching the notices,
editing `data/impacts.source.json`, the judgement calls for titles, categories, dates and places,
validation with `npm run data` and `npm run build`, and the commit.

Ground rules:
- Change nothing outside `data/` unless the build is broken by something you understand; if the
  page layout changed so much that `npm run fetch` finds nothing, update the data by hand and say
  so in the commit message.
- Open every new attachment (PNG or PDF) before placing a road, sidewalk or lot closure.
- Never guess a date or a location the notice doesn't give. Use `precision: "approximate"` and a
  `locationNote` instead.
- Commit to `main` and push. If the push is rejected because `main` moved, `git pull --rebase`
  and push again.

Finish with a short report: notices added, updated and removed (by id), any judgement calls you
weren't sure about, and the commit hash.
