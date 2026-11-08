import re

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import Course, Disc, Hole, HoleScore, Layout, Player, Review, Round, RoundPlayer, utcnow
from app.osm import OSMError, discover
from app.queries import course_or_404, disc_or_404, layout_or_404, player_or_404, round_or_404
from app.schemas import (
    CourseWrite,
    DiscPatch,
    DiscWrite,
    ImportCourse,
    LayoutWrite,
    PlayerIn,
    ReviewIn,
    RoundCreate,
    RoundOrder,
    RoundPatch,
    RoundPlayerIn,
    ScoreIn,
)
from app.serialize import course_card, course_out, disc_out, missing_finished_pars, player_out, round_brief, round_out
from app.stats import player_stats
from app.database import get_db

router = APIRouter()

def _place_query(text: str) -> tuple[list[str], list[str]]:
    cleaned = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    remaining = f" {cleaned} "
    regions: list[str] = []
    for name, code in sorted(STATE_NAMES.items(), key=lambda item: len(item[0]), reverse=True):
        needle = f" {name} "
        if needle in remaining:
            regions.append(code)
            remaining = remaining.replace(needle, " ")
    codes = {code.lower(): code for code in STATE_NAMES.values()}
    words = remaining.split()
    if words and words[-1] in codes:
        regions.append(codes[words[-1]])
        words = words[:-1]
    unique: list[str] = []
    for code in regions:
        if code not in unique:
            unique.append(code)
    return words, unique


STATE_NAMES = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
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
    "district of columbia": "DC",
}


def _name_taken(db: Session, name: str, ignore_id: int | None = None) -> bool:
    stmt = select(Player).where(func.lower(Player.name) == name.lower())
    if ignore_id is not None:
        stmt = stmt.where(Player.id != ignore_id)
    return db.scalar(stmt) is not None


def _apply_course(course: Course, payload: CourseWrite) -> None:
    course.name = payload.name
    course.city = payload.city
    course.region = payload.region
    course.country = payload.country
    course.address = payload.address
    course.latitude = payload.latitude
    course.longitude = payload.longitude
    course.description = payload.description
    course.website = payload.website
    course.tee_type = payload.tee_type
    course.target_type = payload.target_type
    course.foliage = payload.foliage
    for field, value in payload.flag_kwargs().items():
        setattr(course, field, value)


def _placeholder_layout(course: Course, hole_count: int, notes: str) -> None:
    layout = Layout(
        course=course,
        name="Main",
        notes=notes,
        pars_confirmed=False,
    )
    for number in range(1, hole_count + 1):
        layout.holes.append(Hole(number=number, par=3, distance_ft=None, notes=""))
    course.layouts.append(layout)


def _replace_holes(db: Session, layout: Layout, payload: LayoutWrite) -> None:
    layout.name = payload.name
    layout.notes = payload.notes
    layout.pars_confirmed = True
    for hole in list(layout.holes):
        db.delete(hole)
    db.flush()
    for number, hole in enumerate(payload.holes, start=1):
        db.add(
            Hole(
                layout_id=layout.id,
                number=number,
                par=hole.par,
                distance_ft=hole.distance_ft,
                notes=hole.notes,
            )
        )


def _require_live(round_: Round) -> None:
    if round_.status != "live":
        raise HTTPException(status_code=409, detail="Reopen the round before changing scores.")


@router.get("/api/health")
def health() -> dict:
    return {"status": "ok", "app": "Dolf"}


@router.get("/api/players")
def list_players(db: Session = Depends(get_db)) -> list[dict]:
    players = db.scalars(select(Player).order_by(Player.name)).all()
    return [player_out(player) for player in players]


@router.post("/api/players", status_code=201)
def create_player(payload: PlayerIn, db: Session = Depends(get_db)) -> dict:
    if _name_taken(db, payload.name):
        raise HTTPException(status_code=409, detail="A player with that name already exists.")
    player = Player(name=payload.name)
    db.add(player)
    db.commit()
    db.refresh(player)
    return player_out(player)


@router.patch("/api/players/{player_id}")
def rename_player(player_id: int, payload: PlayerIn, db: Session = Depends(get_db)) -> dict:
    player = player_or_404(db, player_id)
    if _name_taken(db, payload.name, ignore_id=player.id):
        raise HTTPException(status_code=409, detail="A player with that name already exists.")
    player.name = payload.name
    db.commit()
    db.refresh(player)
    return player_out(player)


@router.delete("/api/players/{player_id}", status_code=204)
def delete_player(player_id: int, db: Session = Depends(get_db)) -> Response:
    player = player_or_404(db, player_id)
    on_card = db.scalar(select(func.count()).select_from(RoundPlayer).where(RoundPlayer.player_id == player.id))
    reviews = db.scalar(select(func.count()).select_from(Review).where(Review.player_id == player.id))
    if on_card or reviews:
        raise HTTPException(status_code=409, detail="This player has scorecards or reviews. Rename them instead.")
    db.delete(player)
    db.commit()
    return Response(status_code=204)


@router.get("/api/courses")
def list_courses(
    q: str = "",
    dog_friendly: bool | None = None,
    family_friendly: bool | None = None,
    beginner_friendly: bool | None = None,
    scenic: bool | None = None,
    accessible: bool | None = None,
    bathrooms: bool | None = None,
    cart_friendly: bool | None = None,
    pay_to_play: bool | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Course)
    filters = {
        "dog_friendly": dog_friendly,
        "family_friendly": family_friendly,
        "beginner_friendly": beginner_friendly,
        "scenic": scenic,
        "accessible": accessible,
        "bathrooms": bathrooms,
        "cart_friendly": cart_friendly,
        "pay_to_play": pay_to_play,
    }
    for field, value in filters.items():
        if value is not None:
            stmt = stmt.where(getattr(Course, field).is_(value))
    text = " ".join(q.split())
    if text:
        words, regions = _place_query(text)
        if regions:
            stmt = stmt.where(Course.region.in_(regions))
        for word in words:
            like = f"%{word}%"
            stmt = stmt.where(or_(Course.name.ilike(like), Course.city.ilike(like)))
        if not words and not regions:
            like = f"%{text}%"
            stmt = stmt.where(or_(Course.name.ilike(like), Course.city.ilike(like), Course.region.ilike(like)))
        stmt = stmt.limit(40)
    else:
        stmt = stmt.where(Course.source != "catalog")
    courses = db.scalars(stmt.order_by(Course.name).options(selectinload(Course.layouts))).unique().all()
    layout_ids = [layout.id for course in courses for layout in course.layouts]
    stats: dict[int, tuple[int, int, int | None]] = {}
    if layout_ids:
        rows = db.execute(
            select(
                Hole.layout_id,
                func.count(Hole.id),
                func.coalesce(func.sum(Hole.par), 0),
                func.sum(Hole.distance_ft),
                func.count(Hole.distance_ft),
            )
            .where(Hole.layout_id.in_(layout_ids))
            .group_by(Hole.layout_id)
        ).all()
        for layout_id, count, par, distance, distance_count in rows:
            complete = bool(count) and distance_count == count and distance is not None
            stats[layout_id] = (int(count), int(par or 0), int(distance) if complete else None)
    return [course_card(course, stats) for course in courses]


@router.post("/api/courses", status_code=201)
def create_course(payload: CourseWrite, db: Session = Depends(get_db)) -> dict:
    course = Course(source="user")
    _apply_course(course, payload)
    _placeholder_layout(
        course,
        payload.hole_count,
        "Set each hole's par and distance so scores versus par mean something.",
    )
    db.add(course)
    db.commit()
    return course_out(course_or_404(db, course.id))


@router.get("/api/courses/discover")
def discover_courses(q: str, db: Session = Depends(get_db)) -> list[dict]:
    try:
        results = discover(q)
    except OSMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    known = set(db.scalars(select(Course.external_id).where(Course.external_id.is_not(None))).all())
    for item in results:
        item["imported"] = item["external_id"] in known
    return results


@router.post("/api/courses/import", status_code=201)
def import_course(payload: ImportCourse, db: Session = Depends(get_db)) -> dict:
    existing = db.scalar(select(Course).where(Course.external_id == payload.external_id))
    if existing is None and payload.city:
        existing = db.scalar(
            select(Course).where(
                func.lower(Course.name) == payload.name.lower(),
                func.lower(Course.city) == payload.city.lower(),
            )
        )
        if existing is not None and not existing.external_id:
            existing.external_id = payload.external_id
            db.commit()
    if existing is not None:
        return course_out(course_or_404(db, existing.id))

    course = Course(
        name=payload.name,
        city=payload.city,
        region=payload.region,
        country=payload.country,
        latitude=payload.latitude,
        longitude=payload.longitude,
        description=payload.description or "Saved from the public map. Set hole pars before you trust the score versus par.",
        website=payload.website,
        source="osm",
        external_id=payload.external_id,
    )
    _placeholder_layout(
        course,
        payload.hole_count,
        "Imported from the public map. Set each hole's par and distance.",
    )
    db.add(course)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(Course).where(Course.external_id == payload.external_id))
        if existing is None:
            raise HTTPException(status_code=409, detail="That course is already saved.")
        return course_out(course_or_404(db, existing.id))
    return course_out(course_or_404(db, course.id))


@router.get("/api/courses/{course_id}")
def get_course(course_id: int, db: Session = Depends(get_db)) -> dict:
    return course_out(course_or_404(db, course_id))


@router.patch("/api/courses/{course_id}")
def update_course(course_id: int, payload: CourseWrite, db: Session = Depends(get_db)) -> dict:
    course = course_or_404(db, course_id)
    _apply_course(course, payload)
    db.commit()
    return course_out(course_or_404(db, course.id))


@router.delete("/api/courses/{course_id}", status_code=204)
def delete_course(course_id: int, db: Session = Depends(get_db)) -> Response:
    course = course_or_404(db, course_id)
    rounds = db.scalar(select(func.count()).select_from(Round).where(Round.course_id == course.id))
    if rounds:
        raise HTTPException(status_code=409, detail="Delete the rounds on this course first.")
    db.delete(course)
    db.commit()
    return Response(status_code=204)


@router.post("/api/courses/{course_id}/layouts", status_code=201)
def create_layout(course_id: int, payload: LayoutWrite, db: Session = Depends(get_db)) -> dict:
    course = course_or_404(db, course_id)
    layout = Layout(course_id=course.id, name=payload.name, notes=payload.notes, pars_confirmed=True)
    db.add(layout)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That layout name is already on this course.")
    for number, hole in enumerate(payload.holes, start=1):
        db.add(Hole(layout_id=layout.id, number=number, par=hole.par, distance_ft=hole.distance_ft, notes=hole.notes))
    db.commit()
    return course_out(course_or_404(db, course.id))


@router.put("/api/layouts/{layout_id}")
def update_layout(layout_id: int, payload: LayoutWrite, db: Session = Depends(get_db)) -> dict:
    layout = layout_or_404(db, layout_id)
    course_id = layout.course_id
    try:
        _replace_holes(db, layout, payload)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That layout name is already on this course.")
    return course_out(course_or_404(db, course_id))


@router.delete("/api/layouts/{layout_id}", status_code=204)
def delete_layout(layout_id: int, db: Session = Depends(get_db)) -> Response:
    layout = layout_or_404(db, layout_id)
    used = db.scalar(select(func.count()).select_from(Round).where(Round.layout_id == layout.id))
    if used:
        raise HTTPException(status_code=409, detail="A round uses this layout.")
    db.delete(layout)
    db.commit()
    return Response(status_code=204)


@router.post("/api/courses/{course_id}/reviews", status_code=201)
def create_review(course_id: int, payload: ReviewIn, db: Session = Depends(get_db)) -> dict:
    course_or_404(db, course_id)
    player_or_404(db, payload.player_id)
    db.add(
        Review(
            course_id=course_id,
            player_id=payload.player_id,
            rating=payload.rating,
            conditions=payload.conditions,
            body=payload.body,
        )
    )
    db.commit()
    return course_out(course_or_404(db, course_id))


@router.delete("/api/reviews/{review_id}", status_code=204)
def delete_review(review_id: int, db: Session = Depends(get_db)) -> Response:
    review = db.get(Review, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="That note is already gone.")
    db.delete(review)
    db.commit()
    return Response(status_code=204)


@router.get("/api/rounds")
def list_rounds(
    status: str | None = None,
    player_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Round).options(
        selectinload(Round.course),
        selectinload(Round.layout).selectinload(Layout.holes),
        selectinload(Round.scores),
        selectinload(Round.players).selectinload(RoundPlayer.player),
    )
    if status:
        if status not in {"live", "finished"}:
            raise HTTPException(status_code=422, detail="Status must be live or finished.")
        stmt = stmt.where(Round.status == status)
    if player_id is not None:
        stmt = stmt.join(RoundPlayer, RoundPlayer.round_id == Round.id).where(RoundPlayer.player_id == player_id)
    rounds = db.scalars(stmt.order_by(Round.started_at.desc()).limit(100)).unique().all()
    return [round_brief(round_) for round_ in rounds]


@router.post("/api/rounds", status_code=201)
def start_round(payload: RoundCreate, db: Session = Depends(get_db)) -> dict:
    course = course_or_404(db, payload.course_id)
    layout = layout_or_404(db, payload.layout_id)
    if layout.course_id != course.id:
        raise HTTPException(status_code=422, detail="That layout is not on this course.")
    if not layout.holes:
        raise HTTPException(status_code=422, detail="Add holes to the layout before you start.")
    for player_id in payload.player_ids:
        player_or_404(db, player_id)
    round_ = Round(
        course_id=course.id,
        layout_id=layout.id,
        status="live",
        notes=payload.notes,
        weather=payload.weather,
        hide_totals=payload.hide_totals,
        started_at=utcnow(),
    )
    db.add(round_)
    db.flush()
    for index, player_id in enumerate(payload.player_ids, start=1):
        db.add(RoundPlayer(round_id=round_.id, player_id=player_id, tee_order=index))
    db.commit()
    return round_out(round_or_404(db, round_.id))


def _save_finished_pars(db: Session, round_: Round) -> Round:
    missing = missing_finished_pars(round_)
    if not missing:
        return round_
    for player_id, hole_number, strokes in missing:
        db.add(HoleScore(round_id=round_.id, player_id=player_id, hole_number=hole_number, strokes=strokes))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return round_or_404(db, round_.id)


@router.get("/api/rounds/{round_id}")
def get_round(round_id: int, db: Session = Depends(get_db)) -> dict:
    return round_out(_save_finished_pars(db, round_or_404(db, round_id)))


@router.patch("/api/rounds/{round_id}")
def update_round(round_id: int, payload: RoundPatch, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    if payload.notes is not None:
        round_.notes = payload.notes
    if payload.weather is not None:
        round_.weather = payload.weather
    if payload.hide_totals is not None:
        round_.hide_totals = payload.hide_totals
    if payload.layout_id is not None and payload.layout_id != round_.layout_id:
        if round_.scores:
            raise HTTPException(
                status_code=409,
                detail="The layout is locked once you start scoring. Delete the round and start again.",
            )
        layout = layout_or_404(db, payload.layout_id)
        if layout.course_id != round_.course_id:
            raise HTTPException(status_code=422, detail="That layout is not on this course.")
        round_.layout_id = layout.id
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.post("/api/rounds/{round_id}/finish")
def finish_round(round_id: int, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    round_.status = "finished"
    round_.finished_at = utcnow()
    db.commit()
    return round_out(_save_finished_pars(db, round_or_404(db, round_.id)))


@router.post("/api/rounds/{round_id}/reopen")
def reopen_round(round_id: int, db: Session = Depends(get_db)) -> dict:
    round_ = _save_finished_pars(db, round_or_404(db, round_id))
    round_.status = "live"
    round_.finished_at = None
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.delete("/api/rounds/{round_id}", status_code=204)
def delete_round(round_id: int, db: Session = Depends(get_db)) -> Response:
    round_ = round_or_404(db, round_id)
    db.delete(round_)
    db.commit()
    return Response(status_code=204)


@router.post("/api/rounds/{round_id}/players")
def add_round_player(round_id: int, payload: RoundPlayerIn, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    _require_live(round_)
    player_or_404(db, payload.player_id)
    if any(seat.player_id == payload.player_id for seat in round_.players):
        raise HTTPException(status_code=409, detail="That player is already on the card.")
    if len(round_.players) >= 12:
        raise HTTPException(status_code=422, detail="A card can hold 12 players.")
    next_order = max((seat.tee_order for seat in round_.players), default=0) + 1
    db.add(RoundPlayer(round_id=round_.id, player_id=payload.player_id, tee_order=next_order))
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.delete("/api/rounds/{round_id}/players/{player_id}")
def remove_round_player(round_id: int, player_id: int, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    _require_live(round_)
    seat = next((item for item in round_.players if item.player_id == player_id), None)
    if seat is None:
        raise HTTPException(status_code=404, detail="That player is not on the card.")
    if len(round_.players) == 1:
        raise HTTPException(status_code=409, detail="A card needs at least one player.")
    for score in list(round_.scores):
        if score.player_id == player_id:
            db.delete(score)
    db.delete(seat)
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.put("/api/rounds/{round_id}/order")
def order_round(round_id: int, payload: RoundOrder, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    current = {seat.player_id for seat in round_.players}
    if set(payload.player_ids) != current or len(payload.player_ids) != len(current):
        raise HTTPException(status_code=422, detail="Include each player on the card once.")
    for seat in round_.players:
        seat.tee_order = payload.player_ids.index(seat.player_id) + 1
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.put("/api/rounds/{round_id}/scores")
def save_score(round_id: int, payload: ScoreIn, db: Session = Depends(get_db)) -> dict:
    round_ = round_or_404(db, round_id)
    _require_live(round_)
    if not any(seat.player_id == payload.player_id for seat in round_.players):
        raise HTTPException(status_code=422, detail="That player is not on the card.")
    if not any(hole.number == payload.hole_number for hole in round_.layout.holes):
        raise HTTPException(status_code=422, detail="That hole is not on this layout.")
    existing = next(
        (
            score
            for score in round_.scores
            if score.player_id == payload.player_id and score.hole_number == payload.hole_number
        ),
        None,
    )
    if payload.strokes is None:
        if existing is not None:
            db.delete(existing)
    elif existing is None:
        db.add(
            HoleScore(
                round_id=round_.id,
                player_id=payload.player_id,
                hole_number=payload.hole_number,
                strokes=payload.strokes,
                putts=payload.putts,
                fairway=payload.fairway,
            )
        )
    else:
        existing.strokes = payload.strokes
        existing.putts = payload.putts
        existing.fairway = payload.fairway
    db.commit()
    return round_out(round_or_404(db, round_.id))


@router.get("/api/stats")
def stats(player_id: int, db: Session = Depends(get_db)) -> dict:
    player = player_or_404(db, player_id)
    return player_stats(db, player)


@router.get("/api/discs")
def list_discs(player_id: int, db: Session = Depends(get_db)) -> list[dict]:
    player_or_404(db, player_id)
    discs = db.scalars(select(Disc).where(Disc.player_id == player_id).order_by(Disc.mold)).all()
    return [disc_out(disc) for disc in discs]


@router.post("/api/discs", status_code=201)
def create_disc(payload: DiscWrite, db: Session = Depends(get_db)) -> dict:
    player_or_404(db, payload.player_id)
    disc = Disc(**payload.model_dump())
    db.add(disc)
    db.commit()
    db.refresh(disc)
    return disc_out(disc)


@router.patch("/api/discs/{disc_id}")
def update_disc(disc_id: int, payload: DiscPatch, db: Session = Depends(get_db)) -> dict:
    disc = disc_or_404(db, disc_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(disc, field, value)
    if not disc.mold.strip():
        raise HTTPException(status_code=422, detail="Name the mold.")
    db.commit()
    db.refresh(disc)
    return disc_out(disc)


@router.delete("/api/discs/{disc_id}", status_code=204)
def delete_disc(disc_id: int, db: Session = Depends(get_db)) -> Response:
    disc = disc_or_404(db, disc_id)
    db.delete(disc)
    db.commit()
    return Response(status_code=204)
