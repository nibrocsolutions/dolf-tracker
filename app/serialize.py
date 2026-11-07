from datetime import datetime, timezone
from typing import NamedTuple

from app.models import Course, Disc, Hole, Layout, Player, Review, Round
from app.scoring import RESULT_KEYS, Thrower, format_vs, hole_result, result_label, throwing_order

FLAG_FIELDS = (
    "dog_friendly",
    "family_friendly",
    "beginner_friendly",
    "scenic",
    "accessible",
    "bathrooms",
    "cart_friendly",
    "pay_to_play",
)


def flag_to_bool(value: str) -> bool | None:
    if value == "yes":
        return True
    if value == "no":
        return False
    return None


def bool_to_flag(value: bool | None) -> str:
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return "unknown"


def isoformat_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def player_out(player: Player) -> dict:
    return {"id": player.id, "name": player.name}


def hole_out(hole: Hole) -> dict:
    return {
        "number": hole.number,
        "par": hole.par,
        "distance_ft": hole.distance_ft,
        "notes": hole.notes or "",
    }


def layout_totals(layout: Layout) -> dict:
    holes = sorted(layout.holes, key=lambda hole: hole.number)
    distances = [hole.distance_ft for hole in holes]
    complete = bool(holes) and all(distance is not None for distance in distances)
    return {
        "hole_count": len(holes),
        "par": sum(hole.par for hole in holes),
        "distance_ft": sum(distances) if complete else None,
    }


def layout_out(layout: Layout) -> dict:
    holes = sorted(layout.holes, key=lambda hole: hole.number)
    totals = layout_totals(layout)
    return {
        "id": layout.id,
        "name": layout.name,
        "notes": layout.notes or "",
        "pars_confirmed": layout.pars_confirmed,
        "holes": [hole_out(hole) for hole in holes],
        **totals,
    }


def review_out(review: Review) -> dict:
    return {
        "id": review.id,
        "player_id": review.player_id,
        "player_name": review.player.name if review.player else "",
        "rating": review.rating,
        "conditions": review.conditions,
        "body": review.body or "",
        "created_at": isoformat_utc(review.created_at),
    }


def course_out(course: Course) -> dict:
    layouts = sorted(course.layouts, key=lambda layout: layout.id)
    reviews = sorted(
        course.reviews,
        key=lambda review: review.created_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    rating = None
    if reviews:
        rating = round(sum(review.rating for review in reviews) / len(reviews), 1)
    latest = reviews[0] if reviews else None
    payload = {
        "id": course.id,
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
        "source": course.source,
        "external_id": course.external_id,
        "rating": rating,
        "rating_count": len(reviews),
        "conditions": latest.conditions if latest else None,
        "layouts": [layout_out(layout) for layout in layouts],
        "reviews": [review_out(review) for review in reviews[:20]],
    }
    for field in FLAG_FIELDS:
        payload[field] = bool_to_flag(getattr(course, field))
    return payload


def disc_out(disc: Disc) -> dict:
    return {
        "id": disc.id,
        "player_id": disc.player_id,
        "manufacturer": disc.manufacturer or "",
        "mold": disc.mold,
        "plastic": disc.plastic or "",
        "disc_type": disc.disc_type,
        "speed": disc.speed,
        "glide": disc.glide,
        "turn": disc.turn,
        "fade": disc.fade,
        "weight": disc.weight,
        "color": disc.color or "",
        "in_bag": disc.in_bag,
        "lost": disc.lost,
        "notes": disc.notes or "",
    }


def _par_for(holes: dict[int, Hole], number: int) -> int:
    hole = holes.get(number)
    return hole.par if hole else 3


def missing_finished_pars(round_: Round) -> list[tuple[int, int, int]]:
    """Pars for holes already played on a finished round that were never stored.

    Older rounds kept a birdie or bogey, and left a par as no row. The played
    stretch is every hole up through the last hole that has a saved score.
    """
    if round_.status != "finished" or not round_.scores:
        return []
    played_through = max(score.hole_number for score in round_.scores)
    holes = {hole.number: hole for hole in round_.layout.holes}
    have = {(score.player_id, score.hole_number) for score in round_.scores}
    missing = []
    for seat in round_.players:
        for number in range(1, played_through + 1):
            if (seat.player_id, number) in have:
                continue
            hole = holes.get(number)
            if hole is None:
                continue
            missing.append((seat.player_id, number, hole.par))
    return missing


class _SavedPar(NamedTuple):
    player_id: int
    hole_number: int
    strokes: int
    putts: None = None
    fairway: None = None


def effective_scores(round_: Round) -> list:
    stored = list(round_.scores)
    extra = [_SavedPar(player_id, number, strokes) for player_id, number, strokes in missing_finished_pars(round_)]
    return stored + extra


def score_lines(round_: Round) -> list[dict]:
    holes = {hole.number: hole for hole in round_.layout.holes}
    lines = []
    for seat in sorted(round_.players, key=lambda item: item.tee_order):
        mine = [score for score in effective_scores(round_) if score.player_id == seat.player_id]
        strokes = sum(score.strokes for score in mine)
        par = sum(_par_for(holes, score.hole_number) for score in mine)
        results = {key: 0 for key in RESULT_KEYS}
        for score in mine:
            results[hole_result(score.strokes, _par_for(holes, score.hole_number))] += 1
        putts = [score.putts for score in mine if score.putts is not None]
        fairways = [score.fairway for score in mine if score.fairway]
        lines.append(
            {
                "player_id": seat.player_id,
                "name": seat.player.name,
                "tee_order": seat.tee_order,
                "strokes": strokes,
                "par": par,
                "vs_par": strokes - par,
                "vs_par_label": format_vs(strokes - par) if mine else "—",
                "holes_scored": len(mine),
                "thru": max((score.hole_number for score in mine), default=0),
                "results": results,
                "putts": sum(putts) if putts else None,
                "putt_holes": len(putts),
                "fairway_hits": sum(1 for fairway in fairways if fairway in {"hit", "parked"}),
                "fairway_chances": len(fairways),
                "parked": sum(1 for fairway in fairways if fairway == "parked"),
            }
        )
    return lines


def round_out(round_: Round) -> dict:
    holes = sorted(round_.layout.holes, key=lambda hole: hole.number)
    hole_pars = {hole.number: hole for hole in holes}
    throwers = [Thrower(seat.player_id, seat.player.name) for seat in sorted(round_.players, key=lambda item: item.tee_order)]
    score_map = {(score.player_id, score.hole_number): score.strokes for score in effective_scores(round_)}
    tee_order = {
        str(hole.number): [thrower.id for thrower in throwing_order(throwers, score_map, hole.number)]
        for hole in holes
    }
    return {
        "id": round_.id,
        "status": round_.status,
        "started_at": isoformat_utc(round_.started_at),
        "finished_at": isoformat_utc(round_.finished_at),
        "notes": round_.notes or "",
        "weather": round_.weather or "",
        "hide_totals": round_.hide_totals,
        "course": {
            "id": round_.course.id,
            "name": round_.course.name,
            "city": round_.course.city or "",
            "region": round_.course.region or "",
        },
        "layout": layout_out(round_.layout),
        "players": [
            {"id": seat.player_id, "name": seat.player.name, "tee_order": seat.tee_order}
            for seat in sorted(round_.players, key=lambda item: item.tee_order)
        ],
        "scores": [
            {
                "player_id": score.player_id,
                "hole_number": score.hole_number,
                "strokes": score.strokes,
                "putts": score.putts,
                "fairway": score.fairway,
                "result": hole_result(score.strokes, _par_for(hole_pars, score.hole_number)),
                "result_label": result_label(hole_result(score.strokes, _par_for(hole_pars, score.hole_number))),
                "vs_par": score.strokes - _par_for(hole_pars, score.hole_number),
            }
            for score in sorted(effective_scores(round_), key=lambda item: (item.hole_number, item.player_id))
        ],
        "summary": score_lines(round_),
        "tee_order_by_hole": tee_order,
    }


def round_brief(round_: Round) -> dict:
    detail = round_out(round_)
    return {
        "id": detail["id"],
        "status": detail["status"],
        "started_at": detail["started_at"],
        "finished_at": detail["finished_at"],
        "notes": detail["notes"],
        "weather": detail["weather"],
        "hide_totals": detail["hide_totals"],
        "course": detail["course"],
        "layout": {
            "id": detail["layout"]["id"],
            "name": detail["layout"]["name"],
            "holes": detail["layout"]["holes"],
            "par": detail["layout"]["par"],
            "pars_confirmed": detail["layout"]["pars_confirmed"],
        },
        "players": detail["players"],
        "summary": detail["summary"],
    }
