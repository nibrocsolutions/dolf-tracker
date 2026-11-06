from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Layout, Player, Round, RoundPlayer
from app.scoring import RESULT_KEYS
from app.serialize import isoformat_utc, score_lines


def load_player_rounds(db: Session, player: Player) -> list[Round]:
    return (
        db.scalars(
            select(Round)
            .join(RoundPlayer, RoundPlayer.round_id == Round.id)
            .where(RoundPlayer.player_id == player.id)
            .options(
                selectinload(Round.course),
                selectinload(Round.layout).selectinload(Layout.holes),
                selectinload(Round.scores),
                selectinload(Round.players).selectinload(RoundPlayer.player),
            )
            .order_by(Round.started_at.desc())
        )
        .unique()
        .all()
    )


def _line_for(round_: Round, player_id: int) -> dict | None:
    for line in score_lines(round_):
        if line["player_id"] == player_id:
            return line
    return None


def player_stats(db: Session, player: Player) -> dict:
    rounds = load_player_rounds(db, player)
    finished = [round_ for round_ in rounds if round_.status == "finished"]
    live = [round_ for round_ in rounds if round_.status == "live"]
    results = {key: 0 for key in RESULT_KEYS}
    scored_rounds: list[tuple[Round, dict]] = []
    courses: dict[int, dict] = {}
    aces = []
    putts = 0
    putt_holes = 0
    fairway_hits = 0
    fairway_chances = 0
    parked = 0

    for round_ in finished:
        line = _line_for(round_, player.id)
        if line is None:
            continue
        for key in RESULT_KEYS:
            results[key] += line["results"][key]
        if line["putts"] is not None:
            putts += line["putts"]
            putt_holes += line["putt_holes"]
        fairway_hits += line["fairway_hits"]
        fairway_chances += line["fairway_chances"]
        parked += line["parked"]
        if line["holes_scored"]:
            scored_rounds.append((round_, line))

        course = courses.setdefault(
            round_.course_id,
            {
                "course_id": round_.course_id,
                "name": round_.course.name,
                "city": round_.course.city or "",
                "region": round_.course.region or "",
                "rounds": 0,
                "scored_rounds": 0,
                "vs_total": 0,
                "best_vs_par": None,
                "last_played": isoformat_utc(round_.started_at),
            },
        )
        course["rounds"] += 1
        if line["holes_scored"]:
            course["scored_rounds"] += 1
            course["vs_total"] += line["vs_par"]
            if course["best_vs_par"] is None or line["vs_par"] < course["best_vs_par"]:
                course["best_vs_par"] = line["vs_par"]

        for score in round_.scores:
            if score.player_id != player.id or score.strokes != 1:
                continue
            hole = next((item for item in round_.layout.holes if item.number == score.hole_number), None)
            par = hole.par if hole else 3
            if par >= 2:
                aces.append(
                    {
                        "round_id": round_.id,
                        "course_name": round_.course.name,
                        "hole_number": score.hole_number,
                        "par": par,
                        "played_at": isoformat_utc(round_.started_at),
                    }
                )

    best = None
    if scored_rounds:
        best_round, best_line = min(
            scored_rounds,
            key=lambda item: (
                item[1]["vs_par"],
                -item[1]["holes_scored"],
                -(item[0].started_at.timestamp() if item[0].started_at else 0),
            ),
        )
        best = {
            "round_id": best_round.id,
            "course_name": best_round.course.name,
            "strokes": best_line["strokes"],
            "par": best_line["par"],
            "vs_par": best_line["vs_par"],
            "played_at": isoformat_utc(best_round.started_at),
        }

    average = None
    if scored_rounds:
        average = round(sum(line["vs_par"] for _, line in scored_rounds) / len(scored_rounds), 2)

    course_rows = []
    for course in courses.values():
        scored = course["scored_rounds"]
        course_rows.append(
            {
                **course,
                "average_vs_par": round(course["vs_total"] / scored, 2) if scored else None,
            }
        )
    course_rows.sort(key=lambda row: (-row["rounds"], row["name"].lower()))

    recent = []
    for round_ in finished[:10]:
        line = _line_for(round_, player.id)
        if line is None:
            continue
        recent.append(
            {
                "round_id": round_.id,
                "course_name": round_.course.name,
                "layout_name": round_.layout.name,
                "status": round_.status,
                "started_at": isoformat_utc(round_.started_at),
                "strokes": line["strokes"],
                "vs_par": line["vs_par"],
                "holes_scored": line["holes_scored"],
                "holes": len(round_.layout.holes),
            }
        )

    return {
        "player": {"id": player.id, "name": player.name},
        "rounds_finished": len(finished),
        "rounds_live": len(live),
        "rounds_scored": len(scored_rounds),
        "courses_played": len(courses),
        "average_vs_par": average,
        "best_round": best,
        "results": results,
        "aces": aces[:12],
        "putts_per_hole": round(putts / putt_holes, 2) if putt_holes else None,
        "fairway_pct": round(100 * fairway_hits / fairway_chances) if fairway_chances else None,
        "parked": parked,
        "courses": course_rows,
        "recent": recent,
    }
