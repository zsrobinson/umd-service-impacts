#!/usr/bin/env node
// Print the notices on the Facilities Management page as JSON rows, one per
// table row, with the id each already has in data/impacts.source.json (if any).
//
//   npm run fetch                 # live page
//   npm run fetch -- page.html    # a saved copy
//
// It only reads the tables; every judgement call (titles, places, categories)
// is left to whoever writes data/impacts.source.json. See PROMPT.md.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PAGE = "https://facilities.umd.edu/info-resources/service-impacts"
const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const html = process.argv[2]
  ? readFileSync(process.argv[2], "utf8")
  : await fetch(PAGE, { headers: { "User-Agent": "umd-service-impacts (+https://github.com)" } }).then((r) => {
      if (!r.ok) throw new Error(`${PAGE}: HTTP ${r.status}`)
      return r.text()
    })

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()

// Each table sits under a caption/heading; map it to our section names.
const SECTIONS = [
  [/outage|impact/i, "outages"],
  [/road/i, "roads"],
  [/elevator/i, "elevators"],
]
const FIELDS = {
  title: "title",
  area: "field-area",
  start: "field-start-date-and-time",
  finish: "field-finish-date-and-time",
  repairType: "field-repair-type",
  description: "field-repair-description",
  impactType: "field-service-impact-type",
  contact: "field-contact-person",
  phone: "field-contact-phone",
  attachments: "field-attachments",
}

const known = existsSync(join(root, "data/impacts.source.json"))
  ? JSON.parse(readFileSync(join(root, "data/impacts.source.json"), "utf8")).impacts
  : []
const norm = (s) => s.toLowerCase().replace(/\*+\s*resolved\s*\*+/g, "").replace(/[^a-z0-9]+/g, " ").trim()

const rows = []
const tables = html.split(/<table\b/i).slice(1)
for (const t of tables) {
  const caption = decode((t.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i) ?? [])[1] ?? "")
  const before = html.slice(0, html.indexOf(t)).slice(-600)
  const label = caption || decode(before.split(/<\/?(?:h\d|div)[^>]*>/i).filter((x) => decode(x)).pop() ?? "")
  const section = SECTIONS.find(([re]) => re.test(label))?.[1] ?? "outages"
  for (const tr of t.split(/<\/table>/i)[0].split(/<tr\b/i).slice(1)) {
    if (!/<td\b/i.test(tr)) continue
    const row = { section }
    for (const [key, cls] of Object.entries(FIELDS)) {
      const m = tr.match(new RegExp(`<td[^>]*views-field-${cls}[^>]*>([\\s\\S]*?)</td>`, "i"))
      if (!m) continue
      if (key === "attachments") {
        row.attachments = [...m[1].matchAll(/href="([^"]+)"/g)].map((a) => new URL(a[1].replace(/&amp;/g, "&"), PAGE).href)
      } else {
        row[key] = decode(m[1])
      }
    }
    if (!row.title) continue
    const match = known.find((k) => norm(k.sourceTitle) === norm(row.title))
    rows.push({ existingId: match?.id ?? null, ...row })
  }
}

if (!rows.length) {
  console.error("No rows found: the page layout may have changed. Read the page yourself.")
  process.exit(2)
}
const gone = known.filter((k) => !rows.some((r) => r.existingId === k.id)).map((k) => k.id)
console.log(JSON.stringify({ page: PAGE, fetchedAt: new Date().toISOString(), rows, noLongerListed: gone }, null, 2))
