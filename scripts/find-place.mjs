#!/usr/bin/env node
// Search reference/places.json: `npm run place -- physics` or `npm run place -- "lot 16"`.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const { places } = JSON.parse(readFileSync(join(root, "reference/places.json"), "utf8"))
const words = process.argv.slice(2).join(" ").toLowerCase().split(/\s+/).filter(Boolean)
if (!words.length) {
  console.log("usage: npm run place -- <words>   (kinds: building, parking, road, line)")
  process.exit(1)
}
const hits = places.filter((p) => {
  const hay = [p.id, p.name, ...p.aliases, p.code ?? "", p.number ?? ""].join(" ").toLowerCase()
  return words.every((w) => hay.includes(w))
})
for (const p of hits.slice(0, 25)) {
  const extra = [p.code, p.number && `#${p.number}`, p.aliases.length && `aka ${p.aliases.join("; ")}`].filter(Boolean)
  console.log(`${p.id.padEnd(58)} ${p.name}${extra.length ? `  (${extra.join(", ")})` : ""}  @ ${p.center.join(",")}`)
}
if (!hits.length) console.log("no match; try fewer words, or give the place a custom geometry")
