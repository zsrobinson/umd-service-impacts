#!/usr/bin/env node
// Compile data/impacts.source.json (written by hand or by an LLM) into
// public/data/impacts.json (what the site loads).
//
// It resolves every place reference against reference/places.json, checks
// every field, and fails loudly on anything it doesn't understand, so a bad
// daily update never reaches the site.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(root, "data/impacts.source.json")
const OUT = join(root, "public/data/impacts.json")

const ENUMS = {
  section: ["outages", "roads", "elevators"],
  category: ["hvac", "steam", "water", "electrical", "elevator", "road", "sidewalk", "parking", "fire-safety", "construction", "other"],
  notice: ["planned", "emergency", "unplanned"],
  precision: ["exact", "building", "approximate", "campus-wide"],
}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(-0[45]:00)$/
const CAMPUS = { west: -76.975, east: -76.91, south: 38.965, north: 39.005 }

const places = JSON.parse(readFileSync(join(root, "reference/places.json"), "utf8")).places
const byKey = new Map()
for (const p of places) {
  for (const k of [p.id, p.name, ...p.aliases, p.code, p.number].filter(Boolean)) {
    const key = String(k).toLowerCase()
    if (!byKey.has(key)) byKey.set(key, p)
  }
}

const errors = []
const fail = (where, msg) => errors.push(`${where}: ${msg}`)

function coordsOf(g) {
  if (g.type === "Point") return [g.coordinates]
  if (g.type === "LineString" || g.type === "MultiPoint") return g.coordinates
  if (g.type === "Polygon" || g.type === "MultiLineString") return g.coordinates.flat()
  if (g.type === "MultiPolygon") return g.coordinates.flat(2)
  return []
}

function center(g) {
  const pts = coordsOf(g)
  const sum = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0])
  return [+(sum[0] / pts.length).toFixed(6), +(sum[1] / pts.length).toFixed(6)]
}

function checkGeometry(where, g) {
  if (!g || !["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"].includes(g.type)) {
    return fail(where, `geometry must be GeoJSON, got ${JSON.stringify(g)?.slice(0, 80)}`)
  }
  const pts = coordsOf(g)
  if (!pts.length) return fail(where, "geometry has no coordinates")
  for (const [lng, lat] of pts) {
    if (!(lng > CAMPUS.west && lng < CAMPUS.east && lat > CAMPUS.south && lat < CAMPUS.north)) {
      return fail(where, `coordinate [${lng}, ${lat}] is off campus (is it [lng, lat]?)`)
    }
  }
}

const kindOf = (g) =>
  g.type.includes("Polygon") ? "area" : g.type.includes("LineString") ? "line" : "point"

function resolvePlace(where, p) {
  if (typeof p === "string") p = { ref: p }
  let base
  if (p.ref) {
    base = byKey.get(String(p.ref).toLowerCase())
    if (!base) {
      const q = String(p.ref).toLowerCase().replace(/^[a-z]+-/, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2)
      const hints = places.filter((x) => q.some((w) => x.id.includes(w))).slice(0, 5).map((x) => x.id)
      fail(where, `unknown place "${p.ref}"${hints.length ? ` (did you mean ${hints.join(", ")}?)` : ""}`)
      return null
    }
  }
  let geometry = p.geometry ?? (p.point ? { type: "Point", coordinates: p.point } : base?.geometry)
  if (!geometry) {
    fail(where, "place needs a ref, a point or a geometry")
    return null
  }
  checkGeometry(where, geometry)
  if (errors.length && errors.at(-1).startsWith(where)) return null
  const label = p.label ?? base?.name
  if (!label) fail(where, "a custom place needs a label")
  return {
    ...(base ? { id: base.id } : {}),
    ...(p.geometry || p.point ? { custom: true } : {}),
    label,
    kind: p.geometry || p.point ? kindOf(geometry) : base.kind,
    center: base && !p.geometry && !p.point ? base.center : center(geometry),
    geometry,
  }
}

const src = JSON.parse(readFileSync(SRC, "utf8"))
if (!src.fetchedAt || !ISO.test(src.fetchedAt)) fail("fetchedAt", "must be an ISO time with a -04:00/-05:00 offset")

const ids = new Set()
const impacts = (src.impacts ?? []).map((it, i) => {
  const w = `impacts[${i}] ${it.id ?? "(no id)"}`
  for (const k of ["id", "title", "sourceTitle", "section", "category", "notice", "start", "description", "precision"]) {
    if (typeof it[k] !== "string" || !it[k].trim()) fail(w, `missing ${k}`)
  }
  if (it.id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(it.id)) fail(w, "id must be kebab-case")
  if (ids.has(it.id)) fail(w, "duplicate id")
  ids.add(it.id)
  for (const [k, vals] of Object.entries(ENUMS)) {
    if (it[k] !== undefined && !vals.includes(it[k])) fail(w, `${k} "${it[k]}" is not one of ${vals.join(", ")}`)
  }
  if (it.start && !ISO.test(it.start)) fail(w, `start "${it.start}" must look like 2026-09-28T08:00:00-04:00`)
  if (it.end != null && !ISO.test(it.end)) fail(w, `end "${it.end}" must be null or like 2026-09-28T16:00:00-04:00`)
  if (it.start && it.end && new Date(it.end) < new Date(it.start)) fail(w, "end is before start")
  if (!Array.isArray(it.places) || !it.places.length) fail(w, "needs at least one place")
  for (const a of it.attachments ?? []) if (!/^https:\/\//.test(a)) fail(w, `attachment "${a}" must be an absolute https URL`)

  return {
    id: it.id,
    title: it.title?.trim(),
    sourceTitle: it.sourceTitle?.trim(),
    section: it.section,
    category: it.category,
    services: it.services ?? [],
    notice: it.notice,
    resolved: Boolean(it.resolved),
    start: it.start,
    end: it.end ?? null,
    area: it.area?.trim() ?? "",
    repairType: it.repairType?.trim() ?? "",
    description: it.description?.trim(),
    contacts: it.contacts ?? [],
    phone: it.phone ?? null,
    attachments: it.attachments ?? [],
    precision: it.precision,
    ...(it.locationNote ? { locationNote: it.locationNote } : {}),
    places: (it.places ?? []).map((p, j) => resolvePlace(`${w} places[${j}]`, p)).filter(Boolean),
  }
})

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s) in data/impacts.source.json:\n  ` + errors.join("\n  "))
  process.exit(1)
}

// Shared places (the Purple Line carries three notices) are stored once, in `geometries`;
// coordinates are rounded to ~1 m and lines simplified, which the map can't tell apart.
const round = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(5), +c[1].toFixed(5)] : c.map(round))
function simplify(line, tol = 1.5e-5) {
  if (line.length < 3) return line
  const [a, b] = [line[0], line.at(-1)]
  let max = 0
  let at = 0
  for (let i = 1; i < line.length - 1; i++) {
    const [x, y] = line[i]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(dx, dy) || 1)
    if (d > max) [max, at] = [d, i]
  }
  if (max <= tol) return [a, b]
  return [...simplify(line.slice(0, at + 1), tol).slice(0, -1), ...simplify(line.slice(at), tol)]
}
function compact(g) {
  const c = g.type === "LineString" ? simplify(g.coordinates) : g.type === "MultiLineString" ? g.coordinates.map((l) => simplify(l)) : g.coordinates
  return { type: g.type, coordinates: round(c) }
}
const geometries = {}
for (const it of impacts) {
  for (const p of it.places) {
    p.center = round(p.center)
    if (p.id && !p.custom) {
      geometries[p.id] ??= compact(p.geometry)
      delete p.geometry
    } else {
      p.geometry = compact(p.geometry)
    }
    delete p.custom
  }
}

mkdirSync(dirname(OUT), { recursive: true })
const out = { source: src.source, fetchedAt: src.fetchedAt, compiledAt: new Date().toISOString(), impacts, geometries }
writeFileSync(OUT, JSON.stringify(out) + "\n")
console.log(`✓ ${impacts.length} impacts, ${impacts.reduce((n, i) => n + i.places.length, 0)} places -> public/data/impacts.json`)
