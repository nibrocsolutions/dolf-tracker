import json
import re
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Course, Hole, HoleScore, Layout, Round

CATALOG_PATH = Path(__file__).resolve().parent / "catalog" / "us_courses.json"

# Hole numbers come from public DGCR scorecards and, for Arrowhead, the current
# par-3 layout. Distances are feet. A third value is a hole note.

JOE_ORIGINAL = [
    (3, 310), (3, 232), (4, 345), (3, 150), (3, 300), (3, 342), (3, 194), (3, 177), (3, 334),
    (4, 350), (3, 272), (4, 345), (3, 150), (3, 290), (5, 540), (4, 446), (3, 195), (3, 308),
]
JOE_ALTERNATE = [
    (4, 470), (3, 249), (5, 487), (3, 150), (4, 500), (3, 386), (3, 194), (3, 310), (3, 334),
    (4, 350), (3, 272), (4, 487), (3, 150), (3, 290), (4, 384), (4, 386), (3, 195), (3, 347),
]
CASTLE_LONG = [
    (3, 368), (3, 244), (3, 341), (4, 419), (3, 283), (4, 505), (3, 355), (5, 700), (3, 207),
    (4, 430), (4, 472), (5, 455), (3, 267), (3, 330), (4, 421), (3, 248), (4, 480), (3, 388),
]
CASTLE_SHORT = [
    (3, 308), (3, 244), (3, 341), (3, 346), (3, 283), (4, 505), (3, 355), (5, 700), (3, 207),
    (4, 439), (4, 472), (5, 455), (3, 267), (3, 330), (4, 498), (3, 248), (4, 480), (3, 388),
]
ARROWHEAD = [
    (3, 128), (3, 180), (3, 199), (3, 221), (3, 242), (3, 211), (3, 224), (3, 190), (3, 156),
    (3, 207), (3, 180, "Mando left, away from the playground."), (3, 179), (3, 209), (3, 245),
    (3, 107), (3, 256), (3, 193), (3, 250),
]
UNCW_SHORT = [(3, 144), (3, 319), (3, 174), (3, 162), (3, 155), (3, 181), (3, 129), (3, 169), (4, 301)]
UNCW_LONG = [(3, 231), (3, 391), (3, 246), (3, 237), (3, 281), (3, 261), (3, 129), (3, 213), (4, 472)]
UNCW_EIGHTEEN = UNCW_SHORT + UNCW_LONG
TRINITY = [(3, 153), (3, 173), (3, 177), (3, 174), (3, 193), (3, 171), (3, 125), (3, 141), (3, 186)]

# First-release lists. A database that still has one of these gets the update.
OLD_SIGNATURES = {
    "seed/joe-eakes": {
        (
            (3, 237), (3, 204), (4, 348), (3, 71), (3, 308), (3, 348),
            (3, 273), (3, 226), (4, 445), (4, 295), (3, 224), (4, 362),
            (3, 186), (3, 298), (5, 506), (4, 402), (3, 191), (3, 305),
        ),
    },
    "seed/uncw": {
        (
            (3, 220), (3, 382), (3, 238), (3, 171), (3, 166), (3, 176),
            (3, 123), (3, 155), (3, 296), (3, 124), (3, 316), (3, 161),
            (3, 229), (3, 261), (3, 257), (3, 125), (3, 215), (3, 455),
        ),
    },
    "seed/trinity-good-hops": {
        (
            (3, 143), (3, 129), (3, 178), (3, 178), (3, 190), (3, 160),
            (3, 130), (3, 141), (3, 190), (3, 152), (3, 119), (3, 189),
            (3, 182), (3, 199), (3, 151), (3, 152), (3, 163), (3, 213),
        ),
    },
    "seed/castle-hayne": {tuple((3, None) for _ in range(18))},
    "seed/arrowhead": {tuple((3, None) for _ in range(18))},
}


def _holes(rows):
    normalized = []
    for row in rows:
        par, distance = row[0], row[1]
        notes = row[2] if len(row) > 2 else ""
        normalized.append((par, distance, notes))
    return normalized


def _pair_signature(rows):
    return tuple((par, distance) for par, distance, _notes in _holes(rows))


def _layout_signature(layout: Layout):
    holes = sorted(layout.holes, key=lambda hole: hole.number)
    return tuple((hole.par, hole.distance_ft) for hole in holes)


def _add_layout(course: Course, name: str, notes: str, rows, confirmed: bool = True) -> None:
    layout = Layout(course=course, name=name, notes=notes, pars_confirmed=confirmed)
    for number, (par, distance, hole_notes) in enumerate(_holes(rows), start=1):
        layout.holes.append(Hole(number=number, par=par, distance_ft=distance, notes=hole_notes))
    course.layouts.append(layout)


def _is_stale(layout: Layout, rows, external_id: str) -> bool:
    signature = _layout_signature(layout)
    published = _pair_signature(rows)
    if signature == published:
        return False
    if signature in OLD_SIGNATURES.get(external_id, ()):
        return True
    if not layout.pars_confirmed:
        return True
    if layout.notes and "placeholder" in layout.notes.lower():
        return True
    return False


def _apply_layout(db: Session, layout: Layout, name: str, notes: str, rows) -> bool:
    holes = _holes(rows)
    if layout.id is not None:
        scored = db.scalars(
            select(HoleScore.hole_number)
            .join(Round, HoleScore.round_id == Round.id)
            .where(Round.layout_id == layout.id)
        ).all()
        if any(number > len(holes) for number in scored):
            return False
    layout.name = name
    layout.notes = notes
    layout.pars_confirmed = True
    for hole in list(layout.holes):
        db.delete(hole)
    db.flush()
    for number, (par, distance, hole_notes) in enumerate(holes, start=1):
        layout.holes.append(Hole(number=number, par=par, distance_ft=distance, notes=hole_notes))
    return True


def _attach_layout(db: Session, course: Course, name: str, notes: str, rows) -> None:
    layout = Layout(course=course, name=name, notes=notes, pars_confirmed=True)
    for number, (par, distance, hole_notes) in enumerate(_holes(rows), start=1):
        layout.holes.append(Hole(number=number, par=par, distance_ft=distance, notes=hole_notes))
    course.layouts.append(layout)
    db.add(layout)


PUBLISHED = [
    {
        "external_id": "seed/joe-eakes",
        "course": {
            "description": "Two permanent layouts at Joe Eakes Park in Kure Beach. Original uses the yellow baskets. Alternate uses the red baskets. Parking has a time limit from April through October.",
            "dog_friendly": True,
            "cart_friendly": True,
            "bathrooms": True,
            "beginner_friendly": False,
            "pay_to_play": False,
            "tee_type": "Concrete",
            "target_type": "DISCatcher",
            "foliage": "Wooded",
            "latitude": 33.9983939,
            "longitude": -77.9116613,
        },
        "layouts": [
            ("Original", "Yellow baskets. Hole lengths are the DGCR list updated June 24, 2021.", JOE_ORIGINAL),
            ("Alternate", "Red baskets. Hole lengths are the DGCR list updated June 24, 2021.", JOE_ALTERNATE),
        ],
    },
    {
        "external_id": "seed/uncw",
        "course": {
            "address": "805 Hamilton Drive, Wilmington, NC 28403",
            "description": "Nine baskets beside Greene Track, with short and long tees. The 18-hole layout plays the short tees first and the long tees second. Do not park in the gravel lot across from the course. The Hamilton Drive lot is paid during business hours.",
            "beginner_friendly": True,
            "pay_to_play": False,
            "latitude": 34.2207004,
            "longitude": -77.8783731,
        },
        "layouts": [
            ("Short then long", "Short tees as holes 1-9 and long tees as holes 10-18.", UNCW_EIGHTEEN),
            ("Short tees", "Nine holes from the short tees.", UNCW_SHORT),
            ("Long tees", "Nine holes from the long tees.", UNCW_LONG),
        ],
    },
    {
        "external_id": "seed/trinity-good-hops",
        "course": {
            "description": "Nine-hole pitch and putt beside Good Hops Brewing in Carolina Beach.",
            "beginner_friendly": True,
            "bathrooms": True,
            "pay_to_play": False,
            "latitude": 34.0418569,
            "longitude": -77.9047509,
        },
        "layouts": [
            ("Main", "Nine holes from the DGCR listing.", TRINITY),
        ],
    },
    {
        "external_id": "seed/castle-hayne",
        "course": {
            "description": "Eighteen holes in Castle Hayne Park. Long baskets and short baskets are separate layouts. Concrete tees and Chainstar targets.",
            "accessible": True,
            "bathrooms": True,
            "beginner_friendly": False,
            "pay_to_play": False,
            "tee_type": "Concrete",
            "target_type": "Chainstar",
            "foliage": "Wooded",
            "latitude": 34.3350420,
            "longitude": -77.9028163,
        },
        "layouts": [
            ("Long baskets", "Blue long baskets. Hole lengths are the DGCR list dated February 2, 2018.", CASTLE_LONG),
            ("Short baskets", "Red short baskets. Hole lengths are the DGCR list dated February 2, 2018.", CASTLE_SHORT),
        ],
    },
    {
        "external_id": "seed/arrowhead",
        "course": {
            "address": "Arnold Drive, Wilmington, NC 28412",
            "description": "Eighteen short par-3 holes at Arrowhead Park. Hole 11 has a mando left, away from the playground.",
            "latitude": 34.1366,
            "longitude": -77.91259,
            "dog_friendly": True,
            "cart_friendly": True,
            "bathrooms": True,
            "beginner_friendly": True,
            "accessible": False,
            "pay_to_play": False,
            "tee_type": "Rubber mats",
            "target_type": "DISCatcher",
            "foliage": "Wooded",
        },
        "layouts": [
            ("Main", "Distances follow the current 18-hole par-3 layout.", ARROWHEAD),
        ],
    },
]


def _insert_courses(db: Session) -> None:
    joe = Course(
        name="Joe Eakes Park",
        city="Kure Beach",
        region="NC",
        country="United States",
        address="Joe Eakes Park, Kure Beach, NC",
        source="seed",
        external_id="seed/joe-eakes",
    )
    uncw = Course(
        name="UNCW Disc Golf Course",
        city="Wilmington",
        region="NC",
        country="United States",
        source="seed",
        external_id="seed/uncw",
    )
    trinity = Course(
        name="Trinity at Good Hops",
        city="Carolina Beach",
        region="NC",
        country="United States",
        address="811 Harper Avenue, Carolina Beach, NC",
        source="seed",
        external_id="seed/trinity-good-hops",
    )
    castle = Course(
        name="Castle Hayne Park",
        city="Castle Hayne",
        region="NC",
        country="United States",
        address="4700 Old Avenue, Castle Hayne, NC 28429",
        website="https://www.pdga.com/course-directory/course/castle-hayne-park",
        source="seed",
        external_id="seed/castle-hayne",
    )
    arrowhead = Course(
        name="Arrowhead Park",
        city="Wilmington",
        region="NC",
        country="United States",
        website="https://www.pdga.com/course-directory/course/arrowhead-park",
        source="seed",
        external_id="seed/arrowhead",
    )
    db.add_all([joe, uncw, trinity, castle, arrowhead])
    db.flush()


def sync_published_courses(db: Session) -> None:
    """Fill published pars into the seeded courses without touching a layout someone edited."""
    if not settings.seed_demo:
        return
    for spec in PUBLISHED:
        course = db.scalar(select(Course).where(Course.external_id == spec["external_id"]))
        if course is None:
            continue
        for key, value in spec["course"].items():
            setattr(course, key, value)
        layouts = list(course.layouts)
        for index, (name, notes, rows) in enumerate(spec["layouts"]):
            existing = next((item for item in layouts if item.name == name), None)
            if existing is None and index == 0:
                existing = next((item for item in layouts if item.name == "Main"), None)
            if existing is None and index == 0 and len(layouts) == 1:
                existing = layouts[0]
            if existing is None:
                _attach_layout(db, course, name, notes, rows)
                continue
            if _is_stale(existing, rows, spec["external_id"]) or existing.name != name:
                if _layout_signature(existing) == _pair_signature(rows):
                    existing.name = name
                    existing.notes = notes
                    existing.pars_confirmed = True
                elif _is_stale(existing, rows, spec["external_id"]):
                    _apply_layout(db, existing, name, notes, rows)


def _norm_course_name(name: str) -> str:
    text = (name or "").lower()
    text = re.sub(r"\b(disc golf course|disc golf|dgc|links)\b", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _already_saved(present: set[tuple[str, str]], region: str, name: str) -> bool:
    key = (region.upper(), _norm_course_name(name))
    if key in present:
        return True
    for saved_region, saved_name in present:
        if saved_region != key[0]:
            continue
        if min(len(saved_name), len(key[1])) < 8:
            continue
        if saved_name in key[1] or key[1] in saved_name:
            return True
    return False


def seed_catalog(db: Session) -> int:
    """Add the saved US course list. Courses already on this Pi are left alone."""
    if db.scalar(select(Course.id).where(Course.source == "catalog")):
        return 0
    if not CATALOG_PATH.is_file():
        return 0
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    present = {(course.region.upper(), _norm_course_name(course.name)) for course in db.scalars(select(Course))}
    added: list[Course] = []
    for item in payload["courses"]:
        region = (item.get("region") or "")[:80]
        name = (item.get("name") or "").strip()
        if not name or _already_saved(present, region, name):
            continue
        mapped = item.get("layouts") or []
        course = Course(
            name=name[:120],
            city=(item.get("city") or "")[:80],
            region=region,
            country="United States",
            latitude=item.get("lat"),
            longitude=item.get("lng"),
            website=(item.get("web") or "")[:300],
            description=(
                "Hole pars and distances come from the open course map."
                if mapped
                else "Public course listing. Set hole pars before you trust a score versus par."
            ),
            pay_to_play=item.get("pay"),
            source="catalog",
            external_id=(item.get("id") or "")[:80] or None,
        )
        if mapped:
            seen_names: set[str] = set()
            for layout in mapped:
                layout_name = (layout.get("name") or "Mapped").strip()[:80] or "Mapped"
                base = layout_name
                suffix = 2
                while layout_name.lower() in seen_names:
                    layout_name = f"{base[:76]} {suffix}"
                    suffix += 1
                seen_names.add(layout_name.lower())
                model = Layout(
                    name=layout_name,
                    notes="Pars and distances from the open course map.",
                    pars_confirmed=True,
                )
                for number, hole in enumerate(layout.get("holes") or [], start=1):
                    par = int(hole[0])
                    distance = hole[1]
                    notes = hole[2] if len(hole) > 2 else ""
                    model.holes.append(
                        Hole(
                            number=number,
                            par=par,
                            distance_ft=int(distance) if distance is not None else None,
                            notes=(notes or "")[:500],
                        )
                    )
                if model.holes:
                    course.layouts.append(model)
        if not course.layouts:
            count = item.get("holes") or 18
            try:
                count = int(count)
            except (TypeError, ValueError):
                count = 18
            count = min(36, max(1, count))
            note = "Pars are placeholders from the public course list."
            if not item.get("holes"):
                note = "The listing did not include a hole count, so this is an 18-hole placeholder."
            layout = Layout(name="Main", notes=note, pars_confirmed=False)
            for number in range(1, count + 1):
                layout.holes.append(Hole(number=number, par=3, distance_ft=None, notes=""))
            course.layouts.append(layout)
        added.append(course)
    db.add_all(added)
    db.commit()
    return len(added)


def seed_database(db: Session) -> None:
    if not settings.seed_demo:
        return
    if db.scalar(select(func.count()).select_from(Course)) == 0:
        _insert_courses(db)
    sync_published_courses(db)
    db.commit()
    if settings.catalog_seed:
        seed_catalog(db)
