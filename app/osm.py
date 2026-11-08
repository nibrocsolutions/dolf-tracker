import math
import time
from threading import Lock

import httpx

NOMINATIM = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "DolfTracker/1.0 (self-hosted disc golf scorekeeper)"
_cache: dict[str, tuple[float, list[dict]]] = {}
_lock = Lock()

STATE_CODES = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}


class OSMError(Exception):
    pass


def discover(query: str) -> list[dict]:
    text = " ".join(query.split())
    if len(text) < 2:
        raise OSMError("Enter a town or course name.")
    key = text.lower()
    cached = _cached(key)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=8.0, headers={"User-Agent": USER_AGENT}) as client:
            found = _lookup(client, text)
    except httpx.HTTPError as exc:
        raise OSMError("The map search is busy. Try again in a moment.") from exc
    _store(key, found)
    return [dict(item) for item in found]


def course_from_nominatim(row: dict) -> dict | None:
    if row.get("category") != "leisure" or row.get("type") != "disc_golf_course":
        return None
    kind = row.get("osm_type")
    osm_id = row.get("osm_id")
    name = " ".join(str(row.get("name") or "").split())
    if kind not in {"node", "way", "relation"} or not str(osm_id).isdigit() or not name:
        return None
    address = row.get("address") if isinstance(row.get("address"), dict) else {}
    extras = row.get("extratags") if isinstance(row.get("extratags"), dict) else {}
    city = next(
        (
            str(address[key]).strip()
            for key in ("town", "city", "village", "hamlet", "municipality")
            if address.get(key)
        ),
        "",
    )
    region = _region(address)
    country = "United States" if str(address.get("country_code") or "").lower() == "us" else str(address.get("country") or "")
    holes = _holes(extras)
    try:
        latitude = float(row["lat"])
        longitude = float(row["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    return {
        "external_id": f"{kind}/{osm_id}",
        "name": name[:120],
        "city": city[:80],
        "region": region[:80],
        "country": country[:80],
        "latitude": latitude,
        "longitude": longitude,
        "description": "",
        "website": str(extras.get("website") or extras.get("contact:website") or "")[:300],
        "hole_count": holes,
    }


def _lookup(client: httpx.Client, text: str) -> list[dict]:
    place = _geocode(client, text)
    time.sleep(1.0)
    rows = _nearby(client, place["lat"], place["lon"]) if place else []
    if not rows:
        if place:
            time.sleep(1.0)
        rows = _named(client, text)
    found: dict[str, dict] = {}
    for row in rows:
        course = course_from_nominatim(row)
        if course:
            found.setdefault(course["external_id"], course)
    if place:
        ranked = sorted(
            found.values(),
            key=lambda course: _miles(place["lat"], place["lon"], course["latitude"], course["longitude"]),
        )
    else:
        ranked = list(found.values())
    return ranked[:40]


def _geocode(client: httpx.Client, text: str) -> dict | None:
    response = client.get(
        NOMINATIM,
        params={"q": text, "format": "jsonv2", "limit": 1, "addressdetails": 1, "countrycodes": "us"},
    )
    response.raise_for_status()
    payload = response.json()
    if not payload:
        return None
    row = payload[0]
    try:
        return {"lat": float(row["lat"]), "lon": float(row["lon"])}
    except (KeyError, TypeError, ValueError):
        return None


def _nearby(client: httpx.Client, lat: float, lon: float) -> list[dict]:
    pad = 0.35
    response = client.get(
        NOMINATIM,
        params={
            "q": "[leisure=disc_golf_course]",
            "format": "jsonv2",
            "limit": 40,
            "addressdetails": 1,
            "extratags": 1,
            "viewbox": f"{lon - pad},{lat + pad},{lon + pad},{lat - pad}",
            "bounded": 1,
        },
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


def _named(client: httpx.Client, text: str) -> list[dict]:
    response = client.get(
        NOMINATIM,
        params={
            "q": f"[leisure=disc_golf_course] {text}",
            "format": "jsonv2",
            "limit": 20,
            "addressdetails": 1,
            "extratags": 1,
            "countrycodes": "us",
        },
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


def _region(address: dict) -> str:
    iso = str(address.get("ISO3166-2-lvl4") or "")
    if iso.upper().startswith("US-") and len(iso) == 5:
        return iso[-2:].upper()
    return STATE_CODES.get(str(address.get("state") or "").lower(), "")


def _holes(extras: dict) -> int:
    raw = extras.get("disc_golf:holes") or extras.get("holes")
    try:
        count = int(str(raw))
    except (TypeError, ValueError):
        return 18
    return count if 1 <= count <= 36 else 18


def _miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 3958.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _cached(key: str) -> list[dict] | None:
    with _lock:
        cached = _cache.get(key)
    if not cached or time.time() - cached[0] > 600:
        return None
    return [dict(item) for item in cached[1]]


def _store(key: str, courses: list[dict]) -> None:
    with _lock:
        _cache[key] = (time.time(), courses)
