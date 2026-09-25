// Reading the Facilities Management page: fetch it, parse its tables into rows, and turn a row's
// raw text into the fields data/impacts.source.json uses. No dependencies, so the daily run needs
// no `npm install`.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

export const PAGE = "https://facilities.umd.edu/info-resources/service-impacts"

export async function loadPage(file) {
  if (file) return readFileSync(file, "utf8")
  const r = await fetch(PAGE, { headers: { "User-Agent": "umd-service-impacts (+https://github.com/zsrobinson/umd-service-impacts)" } })
  if (!r.ok) throw new Error(`${PAGE}: HTTP ${r.status}`)
  return r.text()
}

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

/** Every table row on the page, in page order. Throws if the layout changed. */
export function parseRows(html) {
  const rows = []
  for (const t of html.split(/<table\b/i).slice(1)) {
    const caption = decode((t.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i) ?? [])[1] ?? "")
    const section = SECTIONS.find(([re]) => re.test(caption))?.[1] ?? "outages"
    for (const tr of t.split(/<\/table>/i)[0].split(/<tr\b/i).slice(1)) {
      if (!/<td\b/i.test(tr)) continue
      const row = { section }
      for (const [key, cls] of Object.entries(FIELDS)) {
        const m = tr.match(new RegExp(`<td[^>]*views-field-${cls}[^>]*>([\\s\\S]*?)</td>`, "i"))
        if (key === "attachments") {
          row.attachments = m ? [...m[1].matchAll(/href="([^"]+)"/g)].map((a) => new URL(a[1].replace(/&amp;/g, "&"), PAGE).href) : []
        } else {
          row[key] = m ? decode(m[1]) : ""
        }
      }
      if (row.title) rows.push(row)
    }
  }
  if (!rows.length) throw new Error("No notice rows found: the page layout may have changed.")
  return rows
}

export const hashOf = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)

/** Titles compared loosely: case, punctuation and a ***Resolved*** marker don't matter. */
export const titleKey = (s) =>
  s.toLowerCase().replace(/\*+\s*resolved\s*\*+/g, "").replace(/[^a-z0-9]+/g, " ").trim()

// ---- raw text -> source fields -------------------------------------------------------------

const cleanTitle = (t) => t.replace(/\*+\s*resolved\s*\*+/gi, "").replace(/\s+/g, " ").trim()

/** Eastern offset for a wall-clock time: DST runs from 2 am on the second Sunday of March to
 *  2 am on the first Sunday of November. */
function etOffset(y, m, d, h) {
  const firstSunday = (month) => 1 + ((7 - new Date(Date.UTC(y, month - 1, 1)).getUTCDay()) % 7)
  const start = firstSunday(3) + 7
  const end = firstSunday(11)
  const dst =
    (m > 3 && m < 11) || (m === 3 && (d > start || (d === start && h >= 2))) || (m === 11 && (d < end || (d === end && h < 2)))
  return dst ? "-04:00" : "-05:00"
}

/** "09-28-2026  8:00 am" -> "2026-09-28T08:00:00-04:00"; blank -> null. */
export function toIso(text) {
  if (!text?.trim()) return null
  const m = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])\.?\s*m/i)
  if (!m) throw new Error(`Unrecognised date "${text}"`)
  const [mo, d, y, min] = [+m[1], +m[2], +m[3], m[5]]
  let h = +m[4] % 12
  if (m[6].toLowerCase() === "p") h += 12
  const p = (n) => String(n).padStart(2, "0")
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${min}:00${etOffset(y, mo, d, h)}`
}

function noticeOf(row) {
  const t = row.impactType.toLowerCase()
  if (/urgent/i.test(row.title) && /emergenc/i.test(row.description)) return "emergency"
  return ["planned", "emergency", "unplanned"].includes(t) ? t : "planned"
}

const cleanArea = (a) => a.replace(/\*+[^*]*\*+/g, "").replace(/\s+/g, " ").trim() || "See the attached map"

/** The fields that follow mechanically from a row. Everything else is a judgement call. */
export function mechanical(row) {
  return {
    sourceTitle: cleanTitle(row.title),
    section: row.section,
    notice: noticeOf(row),
    resolved: /\*+\s*resolved\s*\*+/i.test(row.title),
    start: toIso(row.start),
    end: toIso(row.finish),
    area: cleanArea(row.area),
    repairType: row.repairType,
    description: row.description,
    contacts: row.contact.split(/\s*(?:,|&|\band\b)\s*/).map((s) => s.trim()).filter(Boolean),
    phone: row.phone || null,
    attachments: row.attachments,
  }
}

/** Which source fields each raw column feeds. */
export const FEEDS = {
  title: ["sourceTitle", "resolved", "notice"],
  section: ["section"],
  area: ["area"],
  start: ["start"],
  finish: ["end"],
  repairType: ["repairType"],
  description: ["description", "notice"],
  impactType: ["notice"],
  contact: ["contacts"],
  phone: ["phone"],
  attachments: ["attachments"],
}

// ---- first guesses for a new notice ---------------------------------------------------------

const CATEGORY_RULES = [
  ["elevator", /elevator/],
  ["fire-safety", /fire alarm|suppression|sprinkler/],
  ["steam", /steam/],
  ["hvac", /hvac|air condition|heating|cooling|chiller/],
  ["water", /water/],
  ["electrical", /electric|power outage/],
  ["road", /road|lane closure|street|drive closure/],
  ["parking", /parking lot|\blot\b/],
  ["sidewalk", /sidewalk|plaza|walkway/],
  ["construction", /paint|roof|floor|construct|install|lift work|noise|excavat|renovat/],
]

export function guessCategory(row) {
  const text = `${row.title} ${row.repairType} ${row.description}`.toLowerCase()
  return CATEGORY_RULES.find(([, re]) => re.test(text))?.[0] ?? "other"
}

export function suggestId(row, taken) {
  const stop = new Set(["the", "and", "of", "a", "an", "in", "to", "for", "at", "on", "urgent", "outage", "notification", "building"])
  const words = cleanTitle(row.title)
    .replace(/^urgent outage notification:\s*/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !stop.has(w))
    .slice(0, 6)
  let id = words.join("-") || "notice"
  for (let n = 2; taken.has(id); n++) id = `${words.join("-")}-${n}`
  return id
}

/** Gazetteer places named in a row's title or area, longest names first. */
export function candidatePlaces(row, places) {
  const text = ` ${cleanTitle(row.title)} ${row.area} `.toLowerCase()
  const keys = []
  for (const p of places) {
    for (const k of [p.name, ...p.aliases]) if (k.length >= 5) keys.push([k.toLowerCase(), p])
  }
  keys.sort((a, b) => b[0].length - a[0].length)
  const found = new Map()
  let rest = text
  for (const [k, p] of keys) {
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`)
    if (re.test(rest)) {
      if (p.kind === "road" && row.section !== "roads" && !/road|lane|drive|street/i.test(row.title)) continue
      found.set(p.id, p)
      rest = rest.replace(re, "$1 ")
    }
  }
  for (const m of text.matchAll(/\blot\s*#?\s*([a-z0-9]{1,3})\b/g)) {
    const p = places.find((x) => x.id === `parking-lot-${m[1]}`)
    if (p) found.set(p.id, p)
  }
  if (found.size) return [...found.values()]
  // Nothing by full name ("Tawes Hall" is "Tawes Fine Arts Building" in the gazetteer): try
  // each distinctive word of the title against building names.
  const generic = new Set(["urgent", "outage", "notification", "building", "buildings", "hall", "center", "library",
    "complex", "house", "annex", "garage", "parking", "floor", "room", "rooms", "elevator", "closure", "maryland",
    "university", "campus", "north", "south", "east", "west", "multiple", "impacted", "service", "services",
    "hvac", "heating", "cooling", "air", "conditioning", "water", "steam", "electrical", "power", "fire", "alarm",
    "system", "systems", "repair", "repairs", "work", "testing", "inspection", "roof", "painting", "modernization",
    "road", "lane", "drive", "sidewalk", "lot", "excavation", "construction", "planned", "emergency"])
  const words = cleanTitle(row.title).toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []
  for (const w of words) {
    if (generic.has(w)) continue
    const re = new RegExp(`\\b${w}\\b`)
    const hits = places.filter((p) => p.kind === "building" && [p.name, ...p.aliases].some((k) => re.test(k.toLowerCase())))
    if (hits.length && hits.length <= 3) hits.forEach((p) => found.set(p.id, p))
  }
  return [...found.values()]
}
