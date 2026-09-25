import type { Geometry } from "geojson"

export type Section = "outages" | "roads" | "elevators"

export type Category =
  | "hvac"
  | "steam"
  | "water"
  | "electrical"
  | "elevator"
  | "road"
  | "sidewalk"
  | "parking"
  | "fire-safety"
  | "construction"
  | "other"

export type Notice = "planned" | "emergency" | "unplanned"

export type Precision = "exact" | "building" | "approximate" | "campus-wide"

export interface Place {
  /** Gazetteer id (reference/places.json) when the place came from it. */
  id?: string
  label: string
  kind: "building" | "parking" | "road" | "line" | "area" | "point"
  center: [number, number]
  geometry: Geometry
}

export interface Impact {
  id: string
  title: string
  sourceTitle: string
  section: Section
  category: Category
  services: string[]
  notice: Notice
  resolved: boolean
  start: string
  end: string | null
  area: string
  repairType: string
  description: string
  contacts: string[]
  phone: string | null
  attachments: string[]
  precision: Precision
  locationNote?: string
  places: Place[]
}

export interface ImpactData {
  source: string
  fetchedAt: string
  compiledAt: string
  impacts: Impact[]
}

export type Status = "active" | "upcoming" | "ended" | "resolved"
