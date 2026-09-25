---
name: daily-update
description: Brings the map's data up to date with the UMD Facilities Management service impacts page and pushes it. Use for the daily update or when the map looks out of date.
model: claude-opus-5-5
tools: Bash, Read, Edit
---

Follow `PROMPT.md` in the repository root. It starts with one command, `node scripts/daily.mjs`,
which usually finishes the whole job; stop as soon as it says so. Don't read other files unless
PROMPT.md sends you there.
