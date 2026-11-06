from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Course, Disc, Layout, Player, Review, Round, RoundPlayer


def player_or_404(db: Session, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found.")
    return player


def course_or_404(db: Session, course_id: int) -> Course:
    course = db.scalar(
        select(Course)
        .where(Course.id == course_id)
        .options(
            selectinload(Course.layouts).selectinload(Layout.holes),
            selectinload(Course.reviews).selectinload(Review.player),
        )
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found.")
    return course


def layout_or_404(db: Session, layout_id: int) -> Layout:
    layout = db.scalar(
        select(Layout).where(Layout.id == layout_id).options(selectinload(Layout.holes), selectinload(Layout.course))
    )
    if layout is None:
        raise HTTPException(status_code=404, detail="Layout not found.")
    return layout


def round_or_404(db: Session, round_id: int) -> Round:
    round_ = db.scalar(
        select(Round)
        .where(Round.id == round_id)
        .options(
            selectinload(Round.course),
            selectinload(Round.layout).selectinload(Layout.holes),
            selectinload(Round.scores),
            selectinload(Round.players).selectinload(RoundPlayer.player),
        )
    )
    if round_ is None:
        raise HTTPException(status_code=404, detail="Round not found.")
    return round_


def disc_or_404(db: Session, disc_id: int) -> Disc:
    disc = db.get(Disc, disc_id)
    if disc is None:
        raise HTTPException(status_code=404, detail="Disc not found.")
    return disc
