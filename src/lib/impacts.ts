import {
  ArrowUpDown,
  BellRing,
  Car,
  Droplet,
  Fan,
  Footprints,
  HardHat,
  SquareParking,
  CloudFog,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

import type { Category, Impact, Status } from "@/types"

export const TZ = "America/New_York"

export const CATEGORIES: Record<Category, { label: string; icon: LucideIcon }> = {
  hvac: { label: "Heating & cooling", icon: Fan },
  steam: { label: "Steam", icon: CloudFog },
  water: { label: "Water", icon: Droplet },
  electrical: { label: "Electrical", icon: Zap },
  elevator: { label: "Elevators", icon: ArrowUpDown },
  road: { label: "Roads", icon: Car },
  sidewalk: { label: "Sidewalks", icon: Footprints },
  parking: { label: "Parking", icon: SquareParking },
  "fire-safety": { label: "Fire safety", icon: BellRing },
  construction: { label: "Construction", icon: HardHat },
  other: { label: "Other", icon: Wrench },
}

/** UMD brand colors: Maryland Red, Maryland Gold, Medium Gray. */
export const STATUS: Record<Status, { label: string; color: string }> = {
  active: { label: "In effect", color: "#e21833" },
  upcoming: { label: "Upcoming", color: "#ffd200" },
  ended: { label: "Ended", color: "#7f7f7f" },
  resolved: { label: "Resolved", color: "#7f7f7f" },
}

export function statusOf(impact: Impact, now: number): Status {
  if (impact.resolved) return "resolved"
  if (now < Date.parse(impact.start)) return "upcoming"
  if (impact.end && now > Date.parse(impact.end)) return "ended"
  return "active"
}

const STATUS_ORDER: Record<Status, number> = { active: 0, upcoming: 1, ended: 2, resolved: 3 }

/** In effect first (newest first), then upcoming (soonest first), then the rest. */
export function compareImpacts(a: Impact, b: Impact, now: number) {
  const sa = statusOf(a, now)
  const sb = statusOf(b, now)
  if (sa !== sb) return STATUS_ORDER[sa] - STATUS_ORDER[sb]
  const ta = Date.parse(a.start)
  const tb = Date.parse(b.start)
  return sa === "upcoming" ? ta - tb : tb - ta
}

const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" })
const dayYearFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
const yearFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" })

export function formatDate(iso: string, now: number) {
  const d = new Date(iso)
  return yearFmt.format(d) === yearFmt.format(now) ? dayFmt.format(d) : dayYearFmt.format(d)
}

export function formatTime(iso: string) {
  return timeFmt.format(new Date(iso))
}

export function formatDateTime(iso: string, now: number) {
  return `${formatDate(iso, now)}, ${formatTime(iso)}`
}

/** "in 3 days", "2 hours ago": the largest unit that fits. */
export function relative(iso: string, now: number) {
  const diff = Date.parse(iso) - now
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 864e5],
    ["month", 30 * 864e5],
    ["week", 7 * 864e5],
    ["day", 864e5],
    ["hour", 36e5],
    ["minute", 6e4],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit)
  }
  return ""
}

/** One line under a list item: when it matters, relative to now. */
export function timingSummary(impact: Impact, now: number) {
  const status = statusOf(impact, now)
  if (status === "upcoming") return `Starts ${relative(impact.start, now)} · ${formatDateTime(impact.start, now)}`
  if (status === "active") {
    if (!impact.end) return `Since ${formatDate(impact.start, now)} · no end date posted`
    return `Until ${formatDateTime(impact.end, now)} · ends ${relative(impact.end, now)}`
  }
  const end = impact.end ?? impact.start
  return `${status === "resolved" ? "Resolved" : "Ended"} ${relative(end, now)} · ${formatDate(end, now)}`
}

export function progress(impact: Impact, now: number) {
  if (!impact.end) return null
  const s = Date.parse(impact.start)
  const e = Date.parse(impact.end)
  return Math.min(1, Math.max(0, (now - s) / (e - s)))
}

export function placeSummary(impact: Impact) {
  const names = impact.places.map((p) => p.label)
  if (names.length <= 2) return names.join(" & ")
  return `${names[0]} + ${names.length - 1} more`
}

export function isImage(url: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(url)
}

export function attachmentName(url: string) {
  const file = decodeURIComponent(url.split("/").pop() ?? url)
  return file.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
}
