#!/usr/bin/env node
// Print the notices on the Facilities Management page as JSON rows (for debugging; the daily
// update uses scripts/daily.mjs). `npm run -s fetch` or `npm run -s fetch -- page.html`.
import { loadPage, parseRows } from "./lib/page.mjs"

console.log(JSON.stringify(parseRows(await loadPage(process.argv[2])), null, 2))
