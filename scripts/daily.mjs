#!/usr/bin/env node
// The daily update, as far as a script can take it.
//
//   node scripts/daily.mjs            fetch the page and bring data/ up to date
//   node scripts/daily.mjs --finish   after filling in "todo" entries: validate, commit, push
//
// Options: --html <file> (use a saved page), --no-push (commit locally only),
//          --dry-run (report only, write nothing).
//
// Exit codes: 0 = done (unchanged, or changed and pushed); 20 = new notices need a person or a
// model to fill in their "todo" fields, then run --finish; 1 = error.
//
// data/page-rows.json keeps each notice's raw row as last seen, so a quiet day costs one fetch
// and a hash comparison, and a changed day touches only the rows that changed.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { FEEDS, candidatePlaces, guessCategory, hashOf, loadPage, mechanical, parseRows, suggestId, titleKey } from "./lib/page.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCE = join(root, "data/impacts.source.json")
const SNAPSHOT = join(root, "data/page-rows.json")
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const dry = flag("--dry-run")

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"))
const writeJson = (f, v, compact = false) => writeFileSync(f, JSON.stringify(v, null, compact ? 0 : 2) + "\n")
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()

function nowEastern() {
  const d = new Date()
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
    }).formatToParts(d).map((p) => [p.type, p.value]),
  )
  const off = parts.timeZoneName.replace("GMT", "") || "+00:00"
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00${off}`
}

/** Bring the checkout up to date with origin/main, when there is one. */
function syncGit() {
  try {
    git("rev-parse", "--is-inside-work-tree")
  } catch {
    return
  }
  if (git("status", "--porcelain", "--", "data")) {
    throw new Error("data/ has uncommitted changes. Finish them (--finish) or discard them first.")
  }
  try {
    git("fetch", "--quiet", "origin", "main")
    if (git("rev-parse", "--abbrev-ref", "HEAD") === "main") git("merge", "--quiet", "--ff-only", "origin/main")
  } catch (e) {
    console.error(`(git sync skipped: ${e.message.split("\n")[0]})`)
  }
}

function commitAndPush(message) {
  git("add", "data")
  if (!git("status", "--porcelain", "--", "data")) return console.log("Nothing to commit.")
  git("commit", "--quiet", "-m", message)
  if (flag("--no-push")) return console.log(`Committed ${git("rev-parse", "--short", "HEAD")} (not pushed).`)
  for (let attempt = 1; ; attempt++) {
    try {
      git("push", "--quiet", "origin", "HEAD:main")
      break
    } catch (e) {
      if (attempt >= 3) throw e
      git("pull", "--quiet", "--rebase", "origin", "main")
    }
  }
  console.log(`Pushed ${git("rev-parse", "--short", "HEAD")} to main: ${message.split("\n")[0]}`)
}

function compile() {
  execFileSync(process.execPath, [join(root, "scripts/compile.mjs")], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
}

function summarize(before, after) {
  const b = before?.rows ?? {}
  const a = after.rows
  const added = Object.keys(a).filter((id) => !b[id])
  const removed = Object.keys(b).filter((id) => !a[id])
  const changed = Object.keys(a).filter((id) => b[id] && hashOf(b[id]) !== hashOf(a[id]))
  const date = nowEastern().slice(0, 10)
  const parts = [added.length && `+${added.length} new`, changed.length && `${changed.length} changed`, removed.length && `-${removed.length} removed`]
  const detail = [
    added.length && `New: ${added.join(", ")}`,
    changed.length && `Changed: ${changed.join(", ")}`,
    removed.length && `Removed: ${removed.join(", ")}`,
  ].filter(Boolean)
  return `Update notices: ${parts.filter(Boolean).join(", ") || "no notice changes"} (${date})\n\n${detail.join("\n")}`
}

// ---------------------------------------------------------------------------------------------

if (flag("--finish")) {
  compile()
  let before = null
  try {
    before = JSON.parse(git("show", "HEAD:data/page-rows.json"))
  } catch {
    /* first snapshot */
  }
  commitAndPush(summarize(before, readJson(SNAPSHOT)))
  process.exit(0)
}

if (!dry) syncGit()
const htmlFile = args.includes("--html") ? args[args.indexOf("--html") + 1] : null
const rows = parseRows(await loadPage(htmlFile))
const pageHash = hashOf(rows)
const snapshot = existsSync(SNAPSHOT) ? readJson(SNAPSHOT) : null

if (snapshot?.pageHash === pageHash) {
  console.log(`No changes: the page still lists the same ${rows.length} notices as on ${snapshot.changedAt.slice(0, 10)}. Nothing to do.`)
  process.exit(0)
}

const source = readJson(SOURCE)
const byId = new Map(source.impacts.map((i) => [i.id, i]))
const oldRows = snapshot?.rows ?? {}
const places = readJson(join(root, "reference/places.json")).places
const newRows = {}
const unmatched = []

// 1. Match each row to the notice it already is: by title, else (a retitled notice) by
//    section + start time + area.
for (const row of rows) {
  const key = titleKey(row.title)
  let id =
    Object.keys(oldRows).find((k) => !newRows[k] && titleKey(oldRows[k].title) === key) ??
    (!snapshot ? source.impacts.find((i) => !newRows[i.id] && titleKey(i.sourceTitle) === key)?.id : undefined)
  let retitled = false
  if (!id) {
    id = Object.keys(oldRows).find(
      (k) => !newRows[k] && !rows.some((r) => titleKey(r.title) === titleKey(oldRows[k].title)) &&
        oldRows[k].section === row.section && oldRows[k].start === row.start && oldRows[k].area === row.area,
    )
    retitled = Boolean(id)
  }
  if (id && byId.has(id)) {
    newRows[id] = row
    if (retitled) byId.get(id).todo = ["The page retitled this notice: check that title and places still fit"]
  } else unmatched.push(row)
}

// 2. Update what changed on known notices, field by field; judgement fields stay as they are.
for (const [id, row] of Object.entries(newRows)) {
  const old = oldRows[id]
  if (old && hashOf(old) === hashOf(row)) continue
  const entry = byId.get(id)
  const m = mechanical(row)
  const fields = old ? Object.keys(FEEDS).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(row[k])) : []
  for (const k of fields) for (const f of FEEDS[k]) entry[f] = m[f]
  if (old && fields.includes("area") && !entry.todo) entry.todo = [`The page changed the area to "${m.area}": check that places still fit`]
}

// 3. New notices: everything mechanical filled in, first guesses for the rest, marked "todo".
const taken = new Set([...byId.keys(), ...Object.keys(newRows)])
for (const row of unmatched) {
  const id = suggestId(row, taken)
  taken.add(id)
  const found = candidatePlaces(row, places)
  const allBuildings = found.length > 0 && found.every((p) => p.kind === "building")
  const m = mechanical(row)
  const entry = {
    id,
    todo: [
      "Write title",
      "Check category, services, places and precision",
      ...(m.description === m.repairType ? ["Description only repeats the repair type: write one sentence from the title"] : []),
    ],
    title: "",
    ...m,
    category: guessCategory(row),
    services: [],
    precision: allBuildings ? "building" : "approximate",
    places: found.map((p) => p.id),
  }
  source.impacts.push(entry)
  byId.set(id, entry)
  newRows[id] = row
}

// 4. Notices no longer listed are dropped (the site greys out ended ones on its own).
const removed = Object.keys(oldRows).filter((id) => !newRows[id])
source.impacts = source.impacts.filter((i) => newRows[i.id])
source.fetchedAt = nowEastern()

const newSnapshot = { pageHash, changedAt: source.fetchedAt, rows: newRows }
const todos = source.impacts.filter((i) => i.todo)

if (dry) {
  console.log(`Dry run: ${unmatched.length} new, ${removed.length} removed, ${todos.length} to fill in.`)
  process.exit(0)
}
writeJson(SOURCE, source)
writeJson(SNAPSHOT, newSnapshot)

if (!todos.length) {
  compile()
  commitAndPush(summarize(snapshot, newSnapshot))
  process.exit(0)
}

console.log(`${todos.length} notice(s) in data/impacts.source.json need filling in (their "todo" lists say what):\n`)
for (const t of todos) {
  const { todo, id, sourceTitle, section, area, repairType, description, category, precision, places: p, attachments } = t
  console.log(JSON.stringify({ id, todo, sourceTitle, section, area, repairType, description, guess: { category, precision, places: p }, attachments }))
}
console.log(`
For each: set title, check category/services/places/precision, delete "todo".
Then: node scripts/daily.mjs --finish`)
process.exit(20)
