import { useEffect, useRef } from "react"
import * as maplibregl from "maplibre-gl"
import type { GeoJSONSource, MapGeoJSONFeature } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import type { Feature, FeatureCollection } from "geojson"

import { STATUS, statusOf } from "@/lib/impacts"
import type { Impact } from "@/types"

// MapLibre finds its worker through a runtime URL the bundler can't see; hand it the built one.
maplibregl.setWorkerUrl(workerUrl)

const STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
}
const CAMPUS_CENTER: [number, number] = [-76.9425, 38.9875]
const CAMPUS_ZOOM = 15
const INTERACTIVE = ["imp-fill", "imp-line", "imp-line-hit", "imp-point"]

const statusColor: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "status"],
  "active",
  STATUS.active.color,
  "upcoming",
  STATUS.upcoming.color,
  STATUS.ended.color,
]

/** Outlines need more contrast than fills: gold disappears against a light basemap. */
function edgeColor(theme: "light" | "dark"): maplibregl.ExpressionSpecification {
  return [
    "match",
    ["get", "status"],
    "active",
    STATUS.active.color,
    "upcoming",
    theme === "dark" ? STATUS.upcoming.color : "#1a1a1a",
    STATUS.ended.color,
  ]
}

interface Props {
  impacts: Impact[]
  now: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  theme: "light" | "dark"
  /** Space covered by overlays (the phone sheet), so fitted bounds stay visible. */
  insets?: { top: number; bottom: number; left: number; right: number }
  resetSignal?: number
}

export function ImpactMap({ impacts, now, selectedId, onSelect, theme, insets, resetSignal }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const data = useRef<{ shapes: FeatureCollection; points: FeatureCollection }>({
    shapes: { type: "FeatureCollection", features: [] },
    points: { type: "FeatureCollection", features: [] },
  })
  const onSelectRef = useRef(onSelect)
  const impactsRef = useRef(impacts)
  const insetsRef = useRef(insets)
  const themeRef = useRef(theme)
  useEffect(() => {
    onSelectRef.current = onSelect
    impactsRef.current = impacts
    insetsRef.current = insets
  })

  // Build GeoJSON whenever the list, the clock or the selection changes.
  useEffect(() => {
    const shapes: Feature[] = []
    const points: Feature[] = []
    impacts.forEach((impact, order) => {
      const props = {
        impactId: impact.id,
        title: impact.title,
        status: statusOf(impact, now),
        selected: impact.id === selectedId,
        dimmed: selectedId !== null && impact.id !== selectedId,
        approximate: impact.precision === "approximate" || impact.precision === "campus-wide",
        order,
      }
      for (const place of impact.places) {
        if (place.geometry.type !== "Point" && place.geometry.type !== "MultiPoint") {
          shapes.push({ type: "Feature", geometry: place.geometry, properties: { ...props, label: place.label } })
        }
        // A dot for every place, except long lines: they are their own marker.
        if (place.kind !== "line" && place.kind !== "road") {
          points.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: place.center },
            properties: { ...props, label: place.label },
          })
        }
      }
    })
    data.current = {
      shapes: { type: "FeatureCollection", features: shapes },
      points: { type: "FeatureCollection", features: points },
    }
    const map = mapRef.current
    if (map?.getSource("imp-shapes")) {
      ;(map.getSource("imp-shapes") as GeoJSONSource).setData(data.current.shapes)
      ;(map.getSource("imp-points") as GeoJSONSource).setData(data.current.points)
    }
  }, [impacts, now, selectedId])

  // Create the map once.
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLES[themeRef.current],
      center: CAMPUS_CENTER,
      zoom: CAMPUS_ZOOM,
      minZoom: 11,
      maxZoom: 19,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.addControl(
      new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      "top-right",
    )
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-right")
    mapRef.current = map

    map.on("style.load", () => addLayers(map, data.current, themeRef.current))

    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: "imp-hover" })
    let chooser: maplibregl.Popup | null = null

    const idsAt = (features: MapGeoJSONFeature[]) => {
      const seen = new Map<string, string>()
      for (const f of features) {
        const id = f.properties.impactId as string
        if (!seen.has(id)) seen.set(id, f.properties.title as string)
      }
      return [...seen]
    }
    const hitsAt = (point: maplibregl.PointLike) => {
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [(point as maplibregl.Point).x - 4, (point as maplibregl.Point).y - 4],
        [(point as maplibregl.Point).x + 4, (point as maplibregl.Point).y + 4],
      ]
      return map.queryRenderedFeatures(box, { layers: INTERACTIVE.filter((l) => map.getLayer(l)) })
    }

    map.on("mousemove", (e) => {
      const hits = idsAt(hitsAt(e.point))
      map.getCanvas().style.cursor = hits.length ? "pointer" : ""
      if (!hits.length || chooser?.isOpen()) return void hover.remove()
      const text = hits.length === 1 ? hits[0][1] : `${hits.length} notices here`
      hover.setLngLat(e.lngLat).setText(text).addTo(map)
    })
    map.getCanvas().addEventListener("mouseleave", () => hover.remove())

    map.on("click", (e) => {
      hover.remove()
      chooser?.remove()
      const hits = idsAt(hitsAt(e.point))
      if (hits.length === 0) return onSelectRef.current(null)
      if (hits.length === 1) return onSelectRef.current(hits[0][0])
      // Several notices overlap here (the Purple Line carries three): let the reader pick.
      const list = document.createElement("div")
      list.className = "imp-chooser"
      const heading = document.createElement("p")
      heading.textContent = `${hits.length} notices here`
      list.append(heading)
      for (const [id, title] of hits) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = title
        b.onclick = () => {
          chooser?.remove()
          onSelectRef.current(id)
        }
        list.append(b)
      }
      chooser = new maplibregl.Popup({ offset: 8, maxWidth: "280px", className: "imp-chooser-popup" })
        .setLngLat(e.lngLat)
        .setDOMContent(list)
        .addTo(map)
    })

    return () => map.remove()
  }, [])

  // Swap the basemap with the theme.
  useEffect(() => {
    const map = mapRef.current
    if (!map || themeRef.current === theme) return
    themeRef.current = theme
    map.setStyle(STYLES[theme], { diff: false })
  }, [theme])

  // Fly to the selection (again once the data arrives, for a #link opened cold).
  const ready = impacts.length > 0
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const impact = impactsRef.current.find((i) => i.id === selectedId)
    if (!impact) return
    const bounds = new maplibregl.LngLatBounds()
    for (const place of impact.places) {
      walk(place.geometry, (c) => bounds.extend(c as [number, number]))
    }
    const pad = insetsRef.current ?? { top: 0, bottom: 0, left: 0, right: 0 }
    map.fitBounds(bounds, {
      padding: { top: pad.top + 60, bottom: pad.bottom + 60, left: pad.left + 60, right: pad.right + 60 },
      maxZoom: 17.2,
      duration: 700,
    })
  }, [selectedId, ready])

  useEffect(() => {
    if (!resetSignal) return
    mapRef.current?.flyTo({ center: CAMPUS_CENTER, zoom: CAMPUS_ZOOM, duration: 700 })
  }, [resetSignal])

  // maplibre-gl.css makes its container position: relative, so it can't be the absolute layer itself.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  )
}

function addLayers(
  map: maplibregl.Map,
  data: { shapes: FeatureCollection; points: FeatureCollection },
  theme: "light" | "dark",
) {
  map.addSource("imp-shapes", { type: "geojson", data: data.shapes })
  map.addSource("imp-points", { type: "geojson", data: data.points })
  const dim = (on: number, off: number): maplibregl.ExpressionSpecification => [
    "case",
    ["get", "dimmed"],
    off,
    on,
  ]
  map.addLayer({
    id: "imp-fill",
    type: "fill",
    source: "imp-shapes",
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "fill-color": statusColor,
      "fill-opacity": ["case", ["get", "selected"], 0.5, ["get", "dimmed"], 0.08, 0.32],
    },
  })
  map.addLayer({
    id: "imp-outline",
    type: "line",
    source: "imp-shapes",
    filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
    paint: {
      "line-color": edgeColor(theme),
      "line-width": ["case", ["get", "selected"], 2.5, 1.25],
      "line-opacity": dim(1, 0.3),
    },
  })
  map.addLayer({
    id: "imp-line-casing",
    type: "line",
    source: "imp-shapes",
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": theme === "dark" ? "#000000" : "#1a1a1a",
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 4.5, 17, ["case", ["get", "selected"], 12, 9]],
      "line-opacity": dim(0.9, 0.3),
    },
  })
  map.addLayer({
    id: "imp-line",
    type: "line",
    source: "imp-shapes",
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": statusColor,
      "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 17, ["case", ["get", "selected"], 8, 5]],
      "line-opacity": dim(0.95, 0.25),
      "line-dasharray": ["case", ["get", "approximate"], ["literal", [2, 1.2]], ["literal", [1, 0]]],
    },
  })
  // Invisible fat line so thin lines are easy to hit with a finger.
  map.addLayer({
    id: "imp-line-hit",
    type: "line",
    source: "imp-shapes",
    filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
    paint: { "line-color": "#000", "line-opacity": 0, "line-width": 18 },
  })
  map.addLayer({
    id: "imp-point",
    type: "circle",
    source: "imp-points",
    layout: { "circle-sort-key": ["case", ["get", "selected"], 1000, ["-", 999, ["get", "order"]]] },
    paint: {
      "circle-color": statusColor,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 16, ["case", ["get", "selected"], 9, 6.5]],
      "circle-stroke-color": theme === "dark" ? "#000000" : "#1a1a1a",
      "circle-stroke-width": ["case", ["get", "selected"], 2.5, 1.5],
      "circle-opacity": dim(1, 0.35),
      "circle-stroke-opacity": dim(1, 0.35),
    },
  })
}

function walk(g: GeoJSON.Geometry, fn: (c: number[]) => void) {
  if (g.type === "Point") fn(g.coordinates)
  else if (g.type === "MultiPoint" || g.type === "LineString") g.coordinates.forEach(fn)
  else if (g.type === "MultiLineString" || g.type === "Polygon") g.coordinates.flat().forEach(fn)
  else if (g.type === "MultiPolygon") g.coordinates.flat(2).forEach(fn)
  else if (g.type === "GeometryCollection") g.geometries.forEach((x) => walk(x, fn))
}
