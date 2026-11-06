"""Full-database export and import for the admin page.

The file is JSON so it can be opened, copied, and restored on another Pi.
"""

from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Course, Disc, Hole, HoleScore, Layout, Player, Review, Round, RoundPlayer, utcnow
from app.serialize import FLAG_FIELDS, isoformat_utc

FORMAT = "dolf-backup"
VERSION = 1

CONDITIONS = {"great", "good", "fair", "poor", "closed"}
FAIRWAYS = {"hit", "left", "right", "parked"}
DISC_TYPES = {"putter", "midrange", "fairway", "distance"}


class BackupError(ValueError):
    """The file is not a Dolf backup we can restore."""


def export_backup(db: Session) -> dict:
    players = db.scalars(select(Player).order_by(Player.id)).all()
    courses = db.scalars(select(Course).order_by(Course.id)).unique().all()
    discs = db.scalars(select(Disc).order_by(Disc.id)).all()
    rounds = db.scalars(select(Round).order_by(Round.id)).unique().all()
    return {
        "format": FORMAT,
        "version": VERSION,
        "exported_at": isoformat_utc(datetime.now(timezone.utc)),
        "players": [_player(player) for player in players],
        "courses": [_course(course) for course in courses],
        "discs": [_disc(disc) for disc in discs],
        "rounds": [_round(round_) for round_ in rounds],
    }


def restore_backup(db: Session, payload: object) -> dict:
    data = _validate(payload)
    _wipe(db)
    for row in data["players"]:
        db.add(Player(id=row["id"], name=row["name"], created_at=row["created_at"]))
    db.flush()
    for row in data["courses"]:
        db.add(Course(id=row["id"], created_at=row["created_at"], **row["fields"]))
    db.flush()
    for row in data["layouts"]:
        db.add(Layout(id=row["id"], created_at=row["created_at"], **{key: row[key] for key in ("course_id", "name", "notes", "pars_confirmed")}))
    db.flush()
    for row in data["holes"]:
        db.add(Hole(**row))
    for row in data["discs"]:
        db.add(Disc(id=row["id"], created_at=row["created_at"], **row["fields"]))
    for row in data["reviews"]:
        db.add(Review(id=row["id"], created_at=row["created_at"], **row["fields"]))
    db.flush()
    for row in data["rounds"]:
        db.add(Round(id=row["id"], **row["fields"]))
    db.flush()
    for row in data["seats"]:
        db.add(RoundPlayer(**row))
    for row in data["scores"]:
        db.add(HoleScore(**row))
    db.commit()
    return {
        "players": len(data["players"]),
        "courses": len(data["courses"]),
        "rounds": len(data["rounds"]),
        "discs": len(data["discs"]),
    }


def summary(db: Session) -> dict:
    rows = []
    for player in db.scalars(select(Player).order_by(Player.name)).all():
        rows.append(
            {
                "id": player.id,
                "name": player.name,
                "rounds": _count(db, RoundPlayer, RoundPlayer.player_id == player.id),
                "scores": _count(db, HoleScore, HoleScore.player_id == player.id),
                "discs": _count(db, Disc, Disc.player_id == player.id),
            }
        )
    return {
        "players": rows,
        "courses": _count(db, Course),
        "rounds": _count(db, Round),
        "live_rounds": _count(db, Round, Round.status == "live"),
        "discs": _count(db, Disc),
    }


def remove_player_and_scores(db: Session, player: Player) -> None:
    """Drop one player, their discs and reviews, and their scores.

    A round stays when someone else is still on the card. A round with nobody
    left is removed with it.
    """
    db.execute(delete(HoleScore).where(HoleScore.player_id == player.id))
    seats = db.scalars(select(RoundPlayer).where(RoundPlayer.player_id == player.id)).all()
    round_ids = [seat.round_id for seat in seats]
    for seat in seats:
        db.delete(seat)
    db.flush()
    for round_id in round_ids:
        remaining = _count(db, RoundPlayer, RoundPlayer.round_id == round_id)
        if remaining:
            continue
        round_ = db.get(Round, round_id)
        if round_ is not None:
            db.delete(round_)
    db.execute(delete(Review).where(Review.player_id == player.id))
    db.delete(player)
    db.commit()


def _count(db: Session, model, *where) -> int:
    stmt = select(func.count()).select_from(model)
    for clause in where:
        stmt = stmt.where(clause)
    return int(db.scalar(stmt) or 0)


def _wipe(db: Session) -> None:
    for model in (HoleScore, RoundPlayer, Round, Review, Disc, Hole, Layout, Course, Player):
        db.execute(delete(model))
    db.flush()


def _player(player: Player) -> dict:
    return {"id": player.id, "name": player.name, "created_at": isoformat_utc(player.created_at)}


def _course(course: Course) -> dict:
    fields = {
        "name": course.name,
        "city": course.city or "",
        "region": course.region or "",
        "country": course.country or "",
        "address": course.address or "",
        "latitude": course.latitude,
        "longitude": course.longitude,
        "description": course.description or "",
        "website": course.website or "",
        "tee_type": course.tee_type or "",
        "target_type": course.target_type or "",
        "foliage": course.foliage or "",
        "source": course.source or "user",
        "external_id": course.external_id,
    }
    for flag in FLAG_FIELDS:
        fields[flag] = getattr(course, flag)
    return {
        "id": course.id,
        "created_at": isoformat_utc(course.created_at),
        **fields,
        "layouts": [
            {
                "id": layout.id,
                "name": layout.name,
                "notes": layout.notes or "",
                "pars_confirmed": bool(layout.pars_confirmed),
                "created_at": isoformat_utc(layout.created_at),
                "holes": [
                    {
                        "id": hole.id,
                        "number": hole.number,
                        "par": hole.par,
                        "distance_ft": hole.distance_ft,
                        "notes": hole.notes or "",
                    }
                    for hole in sorted(layout.holes, key=lambda item: item.number)
                ],
            }
            for layout in sorted(course.layouts, key=lambda item: item.id)
        ],
        "reviews": [
            {
                "id": review.id,
                "player_id": review.player_id,
                "rating": review.rating,
                "conditions": review.conditions,
                "body": review.body or "",
                "created_at": isoformat_utc(review.created_at),
            }
            for review in course.reviews
        ],
    }


def _disc(disc: Disc) -> dict:
    return {
        "id": disc.id,
        "player_id": disc.player_id,
        "manufacturer": disc.manufacturer or "",
        "mold": disc.mold,
        "plastic": disc.plastic or "",
        "disc_type": disc.disc_type or "midrange",
        "speed": disc.speed,
        "glide": disc.glide,
        "turn": disc.turn,
        "fade": disc.fade,
        "weight": disc.weight,
        "color": disc.color or "",
        "in_bag": bool(disc.in_bag),
        "lost": bool(disc.lost),
        "notes": disc.notes or "",
        "created_at": isoformat_utc(disc.created_at),
    }


def _round(round_: Round) -> dict:
    return {
        "id": round_.id,
        "course_id": round_.course_id,
        "layout_id": round_.layout_id,
        "status": round_.status,
        "started_at": isoformat_utc(round_.started_at),
        "finished_at": isoformat_utc(round_.finished_at),
        "notes": round_.notes or "",
        "weather": round_.weather or "",
        "hide_totals": bool(round_.hide_totals),
        "players": [
            {"id": seat.id, "player_id": seat.player_id, "tee_order": seat.tee_order}
            for seat in sorted(round_.players, key=lambda item: item.tee_order)
        ],
        "scores": [
            {
                "id": score.id,
                "player_id": score.player_id,
                "hole_number": score.hole_number,
                "strokes": score.strokes,
                "putts": score.putts,
                "fairway": score.fairway,
            }
            for score in round_.scores
        ],
    }


def _validate(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise BackupError("The backup has to be a JSON object.")
    if payload.get("format") != FORMAT or payload.get("version") != VERSION:
        raise BackupError("This file is not a Dolf backup.")
    players = _rows(payload, "players")
    courses = _rows(payload, "courses")
    discs = _rows(payload, "discs")
    rounds = _rows(payload, "rounds")

    player_ids = _ids(players, "player")
    course_ids: set[int] = set()
    layout_ids: set[int] = set()
    clean_players = []
    clean_courses = []
    clean_layouts = []
    clean_holes = []
    clean_reviews = []
    clean_discs = []
    clean_rounds = []
    clean_seats = []
    clean_scores = []
    external_ids: set[str] = set()

    for row in players:
        player_id = _ident(row, "player")
        clean_players.append(
            {
                "id": player_id,
                "name": _text(row.get("name"), "player name", 40, required=True),
                "created_at": _when(row.get("created_at")) or utcnow(),
            }
        )

    for row in courses:
        course_id = _ident(row, "course")
        if course_id in course_ids:
            raise BackupError("Two courses share an id.")
        course_ids.add(course_id)
        external_id = _optional_text(row.get("external_id"), "external id", 80)
        if external_id:
            if external_id in external_ids:
                raise BackupError("Two courses share a map id.")
            external_ids.add(external_id)
        fields = {
            "name": _text(row.get("name"), "course name", 120, required=True),
            "city": _text(row.get("city"), "city", 80),
            "region": _text(row.get("region"), "state", 80),
            "country": _text(row.get("country"), "country", 80),
            "address": _text(row.get("address"), "address", 200),
            "latitude": _coord(row.get("latitude"), "latitude", -90, 90),
            "longitude": _coord(row.get("longitude"), "longitude", -180, 180),
            "description": _text(row.get("description"), "description", 20000),
            "website": _text(row.get("website"), "website", 300),
            "tee_type": _text(row.get("tee_type"), "tee type", 40),
            "target_type": _text(row.get("target_type"), "target type", 40),
            "foliage": _text(row.get("foliage"), "foliage", 40),
            "source": _text(row.get("source") or "user", "source", 20),
            "external_id": external_id,
        }
        for flag in FLAG_FIELDS:
            fields[flag] = _flag(row.get(flag), flag)
        clean_courses.append({"id": course_id, "created_at": _when(row.get("created_at")) or utcnow(), "fields": fields})
        layout_names: set[str] = set()
        for layout in _child_rows(row, "layouts", "course"):
            layout_id = _ident(layout, "layout")
            if layout_id in layout_ids:
                raise BackupError("Two layouts share an id.")
            layout_ids.add(layout_id)
            layout_name = _text(layout.get("name"), "layout name", 80, required=True)
            if layout_name.casefold() in layout_names:
                raise BackupError("A course has two layouts with the same name.")
            layout_names.add(layout_name.casefold())
            clean_layouts.append(
                {
                    "id": layout_id,
                    "course_id": course_id,
                    "name": layout_name,
                    "notes": _text(layout.get("notes"), "layout notes", 20000),
                    "pars_confirmed": bool(layout.get("pars_confirmed")),
                    "created_at": _when(layout.get("created_at")) or utcnow(),
                }
            )
            seen_numbers: set[int] = set()
            for hole in _child_rows(layout, "holes", "layout"):
                number = _number(hole.get("number"), "hole number", 1, 36)
                if number in seen_numbers:
                    raise BackupError("A layout repeats a hole number.")
                seen_numbers.add(number)
                clean_holes.append(
                    {
                        "id": _ident(hole, "hole"),
                        "layout_id": layout_id,
                        "number": number,
                        "par": _number(hole.get("par"), "par", 1, 12),
                        "distance_ft": _optional_number(hole.get("distance_ft"), "distance", 0, 5000),
                        "notes": _text(hole.get("notes"), "hole note", 20000),
                    }
                )
        for review in _child_rows(row, "reviews", "course"):
            player_id = _number(review.get("player_id"), "review player", 1, 10**9)
            if player_id not in player_ids:
                raise BackupError("A review names a player who is not in the backup.")
            conditions = str(review.get("conditions") or "good")
            if conditions not in CONDITIONS:
                raise BackupError("A review has a condition this app doesn't know.")
            clean_reviews.append(
                {
                    "id": _ident(review, "review"),
                    "created_at": _when(review.get("created_at")) or utcnow(),
                    "fields": {
                        "course_id": course_id,
                        "player_id": player_id,
                        "rating": _number(review.get("rating"), "rating", 1, 5),
                        "conditions": conditions,
                        "body": _text(review.get("body"), "review", 20000),
                    },
                }
            )

    hole_ids = {hole["id"] for hole in clean_holes}
    if len(hole_ids) != len(clean_holes):
        raise BackupError("Two holes share an id.")

    for row in discs:
        player_id = _number(row.get("player_id"), "disc player", 1, 10**9)
        if player_id not in player_ids:
            raise BackupError("A disc belongs to a player who is not in the backup.")
        disc_type = str(row.get("disc_type") or "midrange")
        if disc_type not in DISC_TYPES:
            raise BackupError("A disc has a type this app doesn't know.")
        clean_discs.append(
            {
                "id": _ident(row, "disc"),
                "created_at": _when(row.get("created_at")) or utcnow(),
                "fields": {
                    "player_id": player_id,
                    "manufacturer": _text(row.get("manufacturer"), "maker", 60),
                    "mold": _text(row.get("mold"), "mold", 60, required=True),
                    "plastic": _text(row.get("plastic"), "plastic", 60),
                    "disc_type": disc_type,
                    "speed": _optional_number(row.get("speed"), "speed", 1, 15),
                    "glide": _optional_number(row.get("glide"), "glide", 1, 7),
                    "turn": _optional_float(row.get("turn"), "turn"),
                    "fade": _optional_float(row.get("fade"), "fade"),
                    "weight": _optional_number(row.get("weight"), "weight", 1, 300),
                    "color": _text(row.get("color"), "color", 40),
                    "in_bag": bool(row.get("in_bag", True)),
                    "lost": bool(row.get("lost", False)),
                    "notes": _text(row.get("notes"), "disc notes", 20000),
                },
            }
        )

    round_ids: set[int] = set()
    for row in rounds:
        round_id = _ident(row, "round")
        if round_id in round_ids:
            raise BackupError("Two rounds share an id.")
        round_ids.add(round_id)
        course_id = _number(row.get("course_id"), "round course", 1, 10**9)
        layout_id = _number(row.get("layout_id"), "round layout", 1, 10**9)
        if course_id not in course_ids or layout_id not in layout_ids:
            raise BackupError("A round points at a course or layout that is not in the backup.")
        status = str(row.get("status") or "")
        if status not in {"live", "finished"}:
            raise BackupError("A round has to be live or finished.")
        clean_rounds.append(
            {
                "id": round_id,
                "fields": {
                    "course_id": course_id,
                    "layout_id": layout_id,
                    "status": status,
                    "started_at": _when(row.get("started_at")) or utcnow(),
                    "finished_at": _when(row.get("finished_at")),
                    "notes": _text(row.get("notes"), "round note", 20000),
                    "weather": _text(row.get("weather"), "weather", 40),
                    "hide_totals": bool(row.get("hide_totals")),
                },
            }
        )
        seen_players: set[int] = set()
        for seat in _child_rows(row, "players", "round"):
            player_id = _number(seat.get("player_id"), "card player", 1, 10**9)
            if player_id not in player_ids:
                raise BackupError("A card names a player who is not in the backup.")
            if player_id in seen_players:
                raise BackupError("A player is on the same card twice.")
            seen_players.add(player_id)
            clean_seats.append(
                {
                    "id": _ident(seat, "card seat"),
                    "round_id": round_id,
                    "player_id": player_id,
                    "tee_order": _number(seat.get("tee_order"), "tee order", 1, 12),
                }
            )
        for score in _child_rows(row, "scores", "round"):
            player_id = _number(score.get("player_id"), "score player", 1, 10**9)
            if player_id not in seen_players:
                raise BackupError("A score is for a player who is not on that card.")
            fairway = score.get("fairway")
            if fairway not in (None, "") and fairway not in FAIRWAYS:
                raise BackupError("A score has a fairway this app doesn't know.")
            clean_scores.append(
                {
                    "id": _ident(score, "score"),
                    "round_id": round_id,
                    "player_id": player_id,
                    "hole_number": _number(score.get("hole_number"), "score hole", 1, 36),
                    "strokes": _number(score.get("strokes"), "strokes", 1, 20),
                    "putts": _optional_number(score.get("putts"), "putts", 0, 12),
                    "fairway": fairway or None,
                }
            )

    for label, rows in (("card seat", clean_seats), ("score", clean_scores), ("disc", clean_discs), ("review", clean_reviews)):
        ids = [row["id"] for row in rows]
        if len(ids) != len(set(ids)):
            raise BackupError(f"Two {label}s share an id.")

    return {
        "players": clean_players,
        "courses": clean_courses,
        "layouts": clean_layouts,
        "holes": clean_holes,
        "reviews": clean_reviews,
        "discs": clean_discs,
        "rounds": clean_rounds,
        "seats": clean_seats,
        "scores": clean_scores,
    }


def _rows(payload: dict, key: str) -> list:
    value = payload.get(key)
    if not isinstance(value, list):
        raise BackupError(f"The backup is missing {key}.")
    for item in value:
        if not isinstance(item, dict):
            raise BackupError(f"A {key[:-1]} entry is not an object.")
    return value


def _child_rows(row: dict, key: str, owner: str) -> list:
    value = row.get(key, [])
    if not isinstance(value, list):
        raise BackupError(f"A {owner} has a {key} list that isn't a list.")
    for item in value:
        if not isinstance(item, dict):
            raise BackupError(f"A {key[:-1]} entry is not an object.")
    return value


def _ids(rows: list, label: str) -> set[int]:
    found = {_ident(row, label) for row in rows}
    if len(found) != len(rows):
        raise BackupError(f"Two {label}s share an id.")
    return found


def _ident(row: dict, label: str) -> int:
    return _number(row.get("id"), f"{label} id", 1, 10**12)


def _number(value, label: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise BackupError(f"A {label} is missing.")
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise BackupError(f"A {label} has to be a number.") from exc
    if number < low or number > high:
        raise BackupError(f"A {label} is out of range.")
    return number


def _optional_number(value, label: str, low: int, high: int) -> int | None:
    if value is None or value == "":
        return None
    return _number(value, label, low, high)


def _optional_float(value, label: str) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise BackupError(f"A {label} has to be a number.")
    try:
        number = float(value)
    except ValueError as exc:
        raise BackupError(f"A {label} has to be a number.") from exc
    if not -10 <= number <= 10:
        raise BackupError(f"A {label} is out of range.")
    return number


def _text(value, label: str, limit: int, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise BackupError(f"A {label} has to be text.")
    cleaned = value.strip()
    if required and not cleaned:
        raise BackupError(f"A {label} is blank.")
    if len(cleaned) > limit:
        raise BackupError(f"A {label} is too long.")
    return cleaned


def _optional_text(value, label: str, limit: int) -> str | None:
    cleaned = _text(value, label, limit)
    return cleaned or None


def _flag(value, label: str) -> bool | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    raise BackupError(f"{label.replace('_', ' ')} has to be yes, no, or blank.")


def _coord(value, label: str, low: float, high: float) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise BackupError(f"A {label} has to be a number.")
    number = float(value)
    if not low <= number <= high:
        raise BackupError(f"A {label} is out of range.")
    return number


def _when(value) -> datetime | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise BackupError("A date in the backup is not text.")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BackupError("A date in the backup could not be read.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed
