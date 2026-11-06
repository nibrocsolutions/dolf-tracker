import re

import httpx

USER_AGENT = "DolfTracker/1.0 (self-hosted disc golf scorekeeper)"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
OVERPASS_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)


class OSMError(Exception):
    pass


def _client() -> httpx.Client:
    return httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=20, follow_redirects=True)


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z .,'-]+", " ", value).strip()
    return re.sub(r"\s+", " ", cleaned)[:60]


def _element_to_course(element: dict) -> dict | None:
    tags = element.get("tags") or {}
    name = (tags.get("name") or "").strip()
    if not name:
        return None
    center = element.get("center") or {}
    lat = element.get("lat", center.get("lat"))
    lon = element.get("lon", center.get("lon"))
    try:
        latitude = float(lat) if lat is not None else None
        longitude = float(lon) if lon is not None else None
    except (TypeError, ValueError):
        latitude = None
        longitude = None
    raw_holes = tags.get("disc_golf:holes") or tags.get("holes") or ""
    hole_count = 18
    if str(raw_holes).isdigit():
        parsed = int(raw_holes)
        if 1 <= parsed <= 36:
            hole_count = parsed
    website = tags.get("website") or tags.get("contact:website") or ""
    if website and not website.startswith(("http://", "https://")):
        website = ""
    kind = element.get("type") or "node"
    if kind not in {"node", "way", "relation"}:
        return None
    return {
        "external_id": f"{kind}/{element.get('id')}",
        "name": name[:120],
        "city": (tags.get("addr:city") or "")[:80],
        "region": (tags.get("addr:state") or "")[:80],
        "country": (tags.get("addr:country") or "")[:80],
        "latitude": latitude,
        "longitude": longitude,
        "description": "",
        "website": website[:300],
        "hole_count": hole_count,
    }


def _geocode(client: httpx.Client, query: str) -> dict | None:
    response = client.get(
        NOMINATIM,
        params={"q": query, "format": "jsonv2", "limit": 1},
    )
    response.raise_for_status()
    rows = response.json()
    if not rows:
        return None
    return {"lat": float(rows[0]["lat"]), "lon": float(rows[0]["lon"])}


def _overpass(client: httpx.Client, query: str) -> list[dict]:
    last_error: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            response = client.post(endpoint, data={"data": query})
            response.raise_for_status()
            payload = response.json()
            return payload.get("elements") or []
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
    raise OSMError("The map search is busy. Try again in a minute, or add the course yourself.") from last_error


def discover(query: str) -> list[dict]:
    text = " ".join(query.split())
    if len(text) < 2:
        raise OSMError("Enter a city or course name.")
    if len(text) > 80:
        text = text[:80]
    found: dict[str, dict] = {}
    try:
        with _client() as client:
            place = None
            try:
                place = _geocode(client, text)
            except httpx.HTTPError:
                place = None
            if place:
                south = place["lat"] - 0.35
                west = place["lon"] - 0.4
                north = place["lat"] + 0.35
                east = place["lon"] + 0.4
                around = (
                    f"[out:json][timeout:20];"
                    f"(nwr[\"leisure\"=\"disc_golf_course\"]({south},{west},{north},{east}););"
                    f"out center tags 40;"
                )
                for element in _overpass(client, around):
                    course = _element_to_course(element)
                    if course:
                        found[course["external_id"]] = course
            safe = _safe_name(text)
            if len(safe) >= 3:
                by_name = (
                    "[out:json][timeout:20];"
                    f'(nwr["leisure"="disc_golf_course"]["name"~"{safe}",i];);'
                    "out center tags 20;"
                )
                for element in _overpass(client, by_name):
                    course = _element_to_course(element)
                    if course:
                        found.setdefault(course["external_id"], course)
    except OSMError:
        raise
    except httpx.HTTPError as exc:
        raise OSMError("The map search is busy. Try again in a minute, or add the course yourself.") from exc
    return list(found.values())
