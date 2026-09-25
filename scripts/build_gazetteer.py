#!/usr/bin/env python3
"""Build reference/places.json: every campus place an impact can point at.

Run rarely (when campus changes). Sources: OpenStreetMap via Overpass (building
footprints, parking lots, roads, the Purple Line) and api.umd.io (building
numbers and codes). The output is committed; the daily update never needs the
network for geometry.
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

OVERPASS = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter",
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]
BBOX = "38.978,-76.960,39.001,-76.920"
OUT = Path(__file__).resolve().parent.parent / "reference" / "places.json"
ROADS = {"Campus Drive", "Regents Drive", "Stadium Drive", "Fieldhouse Drive", "Fraternity Row",
         "Union Lane", "Paint Branch Drive", "Presidential Drive", "Valley Drive", "Mowatt Lane",
         "Rossborough Lane", "Farm Drive", "Library Lane", "Chapel Drive", "Preinkert Drive",
         "Engineering Drive", "Alumni Drive", "Diamondback Drive", "Terrapin Trail", "Knox Road",
         "Baltimore Avenue", "University Boulevard East", "Adelphi Road", "Lehigh Road",
         "Guilford Drive", "Metzerott Road", "Championship Lane", "Wells Parkway", "Van Munching Way"}


# Names the notices use that neither OSM nor umd.io knows.
EXTRA_ALIASES = {
    "building-engineering-laboratory-building": ["C. Daniel Mote, Jr. Engineering Laboratory Building", "Mote Engineering Laboratory Building"],
    "building-glenn-l-martin-hall": ["Glenn L. Martin Hall"],
    "building-john-s-toll-physics": ["John S. Toll Physics Building", "Toll Physics Building"],
    "building-william-e-kirwan-hall": ["Kirwan Hall", "Math Building"],
    "building-theodore-r-mckeldin-library": ["McKeldin"],
    "building-biosciences-research-building": ["Bioscience Research Building", "BRB"],
    "building-plant-science-building": ["Plant Sciences Building"],
    "building-adele-h-stamp-student-union": ["Stamp", "Student Union"],
    "building-clarice-smith-performing-arts-center": ["The Clarice", "Clarice"],
    "building-a-v-williams-building": ["AVW"],
}


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "umd-service-impacts"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(6):
        url = OVERPASS[attempt % len(OVERPASS)]
        try:
            return get(url, body)["elements"]
        except Exception as err:  # noqa: BLE001  (public Overpass servers time out often)
            print(f"overpass {url}: {err}; retrying", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    sys.exit("Overpass failed")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and").replace("'", "")).strip("-")


def rnd(c):
    return [round(c[0], 6), round(c[1], 6)]


def ring(geom):
    return [rnd([p["lon"], p["lat"]]) for p in geom]


def polygon_of(e):
    if e["type"] == "way":
        return {"type": "Polygon", "coordinates": [ring(e["geometry"])]}
    outers = [ring(m["geometry"]) for m in e.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    return {"type": "MultiPolygon", "coordinates": [[r] for r in outers]}


def centroid(g):
    pts = []
    if g["type"] == "Polygon":
        pts = g["coordinates"][0]
    elif g["type"] == "MultiPolygon":
        pts = [p for poly in g["coordinates"] for p in poly[0]]
    elif g["type"] == "LineString":
        pts = g["coordinates"]
    elif g["type"] == "MultiLineString":
        pts = [p for l in g["coordinates"] for p in l]
    else:
        return g["coordinates"]
    return rnd([sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)])


def inside(pt, g):
    polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
    for poly in polys:
        r, x, y, hit = poly[0], pt[0], pt[1], False
        for i in range(len(r)):
            (x1, y1), (x2, y2) = r[i], r[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
        if hit:
            return True
    return False


QUERY = f"""[out:json][timeout:180];(
  way["building"]["name"]({BBOX}); relation["building"]["name"]({BBOX});
  way["amenity"="parking"]["name"]({BBOX});
  way["highway"]["name"]({BBOX});
  way["railway"="light_rail"](38.970,-76.975,39.000,-76.915);
);out geom;"""


def fetch():
    if "--offline" in sys.argv:  # reuse Overpass JSON dumps: --offline a.json b.json
        files = sys.argv[sys.argv.index("--offline") + 1:]
        merged = {}  # later files win (a relation with member geometry over one without)
        for f in files:
            for e in json.load(open(f))["elements"]:
                merged[(e["type"], e["id"])] = e
        return list(merged.values())
    return overpass(QUERY)


def main():
    places, seen = [], {}
    elements = [e for e in fetch() if e.get("tags")]

    def add(kind, name, geom, aliases=(), **extra):
        if not geom["coordinates"]:
            return None
        pid = f"{kind}-{slug(name)}"
        if pid in seen:  # same name twice (split footprints): merge into a MultiPolygon/MultiLineString
            p = seen[pid]
            if geom["type"].endswith("Polygon") and p["geometry"]["type"].endswith("Polygon"):
                a = p["geometry"]["coordinates"] if p["geometry"]["type"] == "MultiPolygon" else [p["geometry"]["coordinates"]]
                b = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
                p["geometry"] = {"type": "MultiPolygon", "coordinates": a + b}
                p["center"] = centroid(p["geometry"])
            return p
        p = {"id": pid, "kind": kind, "name": name, "aliases": sorted(set(aliases) - {name}), **extra,
             "center": centroid(geom), "geometry": geom}
        places.append(p)
        seen[pid] = p
        return p

    # Buildings (named footprints)
    for e in elements:
        t = e["tags"]
        if not (t.get("building") and t.get("name")):
            continue
        aliases = [t[k] for k in ("alt_name", "old_name", "short_name", "official_name") if t.get(k)]
        add("building", t["name"], polygon_of(e), aliases, **({"number": t["ref"]} if t.get("ref") else {}))

    # Parking (named lots and garages)
    for e in elements:
        if e["tags"].get("amenity") != "parking" or not e["tags"].get("name") or e["type"] != "way":
            continue
        n = e["tags"]["name"]
        m = re.match(r"(?:Parking )?Lot (\S+)$", n)
        name = f"Lot {m.group(1).upper() if len(m.group(1)) <= 3 else m.group(1)}" if m else n
        aliases = [n, f"Parking Lot {m.group(1)}", f"Parking Lot #{m.group(1)}"] if m else [n]
        add("parking", name, polygon_of(e), aliases)

    # Roads (merged per name, clipped to the bbox by the query)
    lines = {}
    for e in elements:
        n = e["tags"].get("name")
        if "highway" in e["tags"] and n in ROADS and e["tags"]["highway"] not in ("footway", "cycleway", "path", "service"):
            lines.setdefault(n, []).append(ring(e["geometry"]))
    for n, ls in sorted(lines.items()):
        add("road", n, {"type": "MultiLineString", "coordinates": ls})

    # Purple Line alignment through the campus area
    # One track (the two run side by side), clipped to what the notices cover:
    # Adelphi Road (UMGC) to the College Park Metro Station.
    tracks = [ring(e["geometry"]) for e in elements if e["tags"].get("railway") == "light_rail"]
    pl = []
    if tracks:
        keep = [c for c in max(tracks, key=len) if c[0] >= -76.9575 and c[1] >= 38.9780]
        pl = [keep] if len(keep) > 1 else []
    if pl:
        add("line", "Purple Line", {"type": "MultiLineString", "coordinates": pl}, ["Purple Line alignment", "Purple Line (Campus Drive)"])

    # UMD building numbers/codes from api.umd.io, matched to footprints
    try:
        umd = get("https://api.umd.io/v1/map/buildings")
    except Exception as err:  # noqa: BLE001
        print("umd.io unavailable:", err, file=sys.stderr)
        umd = []
    for b in umd:
        if not isinstance(b.get("lat"), float) or abs(b["lat"]) > 90 or b.get("id", "").startswith(("P", "D")):
            continue  # lots and fields are matched by name, not by point
        pt = [b["long"], b["lat"]]
        for p in places:
            if p["kind"] == "building" and inside(pt, p["geometry"]):
                if not re.search(r"Fraternity|Sorority", p["name"]):  # umd.io's Greek names are stale
                    p["aliases"] = sorted(set(p["aliases"]) | {b["name"]} - {p["name"]})
                if b.get("code"):
                    p["code"] = b["code"]
                if b.get("id"):
                    p.setdefault("number", b["id"])
                break

    for p in places:
        p["aliases"] = sorted(set(p["aliases"]) | set(EXTRA_ALIASES.get(p["id"], [])) - {p["name"]})

    places.sort(key=lambda p: (p["kind"], p["name"]))
    OUT.write_text(json.dumps({"_about": __doc__.strip().splitlines()[0], "places": places}, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"{len(places)} places -> {OUT}")


if __name__ == "__main__":
    main()
