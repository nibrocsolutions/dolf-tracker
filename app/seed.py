from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Course, Hole, Layout

# Hole lists for Joe Eakes, the UNCW campus course, and Trinity at Good Hops
# follow publicly posted pars and distances. Castle Hayne and Arrowhead are
# real courses whose pin-by-pin pars are not filled in here.

JOE_EAKES = [
    (3, 237), (3, 204), (4, 348), (3, 71), (3, 308), (3, 348),
    (3, 273), (3, 226), (4, 445), (4, 295), (3, 224), (4, 362),
    (3, 186), (3, 298), (5, 506), (4, 402), (3, 191), (3, 305),
]
UNCW = [
    (3, 220), (3, 382), (3, 238), (3, 171), (3, 166), (3, 176),
    (3, 123), (3, 155), (3, 296), (3, 124), (3, 316), (3, 161),
    (3, 229), (3, 261), (3, 257), (3, 125), (3, 215), (3, 455),
]
TRINITY = [
    (3, 143), (3, 129), (3, 178), (3, 178), (3, 190), (3, 160),
    (3, 130), (3, 141), (3, 190), (3, 152), (3, 119), (3, 189),
    (3, 182), (3, 199), (3, 151), (3, 152), (3, 163), (3, 213),
]


def _add_layout(course: Course, name: str, notes: str, rows: list[tuple[int, int | None]], confirmed: bool) -> None:
    layout = Layout(course=course, name=name, notes=notes, pars_confirmed=confirmed)
    for number, (par, distance) in enumerate(rows, start=1):
        layout.holes.append(Hole(number=number, par=par, distance_ft=distance, notes=""))
    course.layouts.append(layout)


def seed_database(db: Session) -> None:
    if not settings.seed_demo:
        return
    if db.scalar(select(func.count()).select_from(Course)):
        return

    joe = Course(
        name="Joe Eakes Park",
        city="Kure Beach",
        region="NC",
        country="United States",
        address="Joe Eakes Park, Kure Beach, NC",
        latitude=33.9983939,
        longitude=-77.9116613,
        description="Wooded public course in the park at Kure Beach. A mix of short pins and a few longer holes, with restrooms and picnic tables nearby.",
        bathrooms=True,
        beginner_friendly=False,
        pay_to_play=False,
        foliage="Mixed",
        source="seed",
        external_id="seed/joe-eakes",
    )
    _add_layout(
        joe,
        "Main",
        "Pars and distances follow a published hole list. Edit any pin that has moved.",
        JOE_EAKES,
        True,
    )

    uncw = Course(
        name="UNCW Disc Golf Course",
        city="Wilmington",
        region="NC",
        country="United States",
        address="Beside Greene Track, UNC Wilmington",
        latitude=34.2207004,
        longitude=-77.8783731,
        description="Campus course beside Greene Track. Short and long tees share baskets and play as 18 holes. Follow UNCW parking rules before you tee off.",
        beginner_friendly=True,
        pay_to_play=False,
        foliage="Mixed",
        source="seed",
        external_id="seed/uncw",
    )
    _add_layout(
        uncw,
        "Main",
        "Pars and distances follow a published hole list. Edit any pin that has moved.",
        UNCW,
        True,
    )

    trinity = Course(
        name="Trinity at Good Hops",
        city="Carolina Beach",
        region="NC",
        country="United States",
        address="811 Harper Avenue, Carolina Beach, NC",
        latitude=34.0418569,
        longitude=-77.9047509,
        description="Short par-3 course beside Good Hops Brewing. Sandy ground, plenty of trees, and restrooms at the brewery.",
        beginner_friendly=True,
        bathrooms=True,
        pay_to_play=False,
        foliage="Mixed",
        source="seed",
        external_id="seed/trinity-good-hops",
    )
    _add_layout(
        trinity,
        "Main",
        "Pars and distances follow a published hole list. Edit any pin that has moved.",
        TRINITY,
        True,
    )

    castle = Course(
        name="Castle Hayne Park",
        city="Castle Hayne",
        region="NC",
        country="United States",
        address="4700 Old Avenue, Castle Hayne, NC 28429",
        latitude=34.3350420,
        longitude=-77.9028163,
        website="https://www.pdga.com/course-directory/course/castle-hayne-park",
        description="Wooded 18-hole park course with concrete tees. The published length is about 6,913 feet. Set each hole's par before you trust the score versus par.",
        accessible=True,
        bathrooms=True,
        beginner_friendly=False,
        pay_to_play=False,
        tee_type="Concrete",
        target_type="Chainstar",
        foliage="Wooded",
        source="seed",
        external_id="seed/castle-hayne",
    )
    _add_layout(
        castle,
        "Main",
        "Hole pars are placeholders. Open Edit layout and set the par and distance for each pin.",
        [(3, None)] * 18,
        False,
    )

    arrowhead = Course(
        name="Arrowhead Park",
        city="Wilmington",
        region="NC",
        country="United States",
        address="Arnold Drive, Wilmington, NC 28412",
        website="https://www.pdga.com/course-directory/course/arrowhead-park",
        description="Short wooded course. The published length is about 3,464 feet, with every hole under 300 feet. Set each hole's par before you trust the score versus par.",
        beginner_friendly=True,
        accessible=False,
        bathrooms=True,
        pay_to_play=False,
        tee_type="Rubber mats",
        target_type="DISCatcher",
        foliage="Wooded",
        source="seed",
        external_id="seed/arrowhead",
    )
    _add_layout(
        arrowhead,
        "Main",
        "Hole pars are placeholders. Open Edit layout and set the par and distance for each pin.",
        [(3, None)] * 18,
        False,
    )

    db.add_all([joe, uncw, trinity, castle, arrowhead])
    db.commit()
