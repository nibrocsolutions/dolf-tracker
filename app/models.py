from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    discs: Mapped[list["Disc"]] = relationship(back_populates="player", cascade="all, delete-orphan")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    city: Mapped[str] = mapped_column(String(80), default="")
    region: Mapped[str] = mapped_column(String(80), default="")
    country: Mapped[str] = mapped_column(String(80), default="")
    address: Mapped[str] = mapped_column(String(200), default="")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    website: Mapped[str] = mapped_column(String(300), default="")
    tee_type: Mapped[str] = mapped_column(String(40), default="")
    target_type: Mapped[str] = mapped_column(String(40), default="")
    foliage: Mapped[str] = mapped_column(String(40), default="")
    dog_friendly: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    family_friendly: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    beginner_friendly: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    scenic: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    accessible: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    bathrooms: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cart_friendly: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    pay_to_play: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="user")
    external_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    layouts: Mapped[list["Layout"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="course", cascade="all, delete-orphan"
    )


class Layout(Base):
    __tablename__ = "layouts"
    __table_args__ = (UniqueConstraint("course_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    notes: Mapped[str] = mapped_column(Text, default="")
    pars_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    course: Mapped[Course] = relationship(back_populates="layouts")
    holes: Mapped[list["Hole"]] = relationship(
        back_populates="layout", cascade="all, delete-orphan", order_by="Hole.number"
    )


class Hole(Base):
    __tablename__ = "holes"
    __table_args__ = (UniqueConstraint("layout_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    par: Mapped[int] = mapped_column(Integer, default=3)
    distance_ft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    layout: Mapped[Layout] = relationship(back_populates="holes")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="RESTRICT"))
    rating: Mapped[int] = mapped_column(Integer)
    conditions: Mapped[str] = mapped_column(String(20), default="good")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    course: Mapped[Course] = relationship(back_populates="reviews")
    player: Mapped[Player] = relationship()


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="live")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    weather: Mapped[str] = mapped_column(String(40), default="")
    hide_totals: Mapped[bool] = mapped_column(Boolean, default=False)

    course: Mapped[Course] = relationship()
    layout: Mapped[Layout] = relationship()
    players: Mapped[list["RoundPlayer"]] = relationship(
        back_populates="round", cascade="all, delete-orphan", order_by="RoundPlayer.tee_order"
    )
    scores: Mapped[list["HoleScore"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )


class RoundPlayer(Base):
    __tablename__ = "round_players"
    __table_args__ = (UniqueConstraint("round_id", "player_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id", ondelete="CASCADE"))
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="RESTRICT"))
    tee_order: Mapped[int] = mapped_column(Integer, default=1)

    round: Mapped[Round] = relationship(back_populates="players")
    player: Mapped[Player] = relationship()


class HoleScore(Base):
    __tablename__ = "hole_scores"
    __table_args__ = (UniqueConstraint("round_id", "player_id", "hole_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id", ondelete="CASCADE"))
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="RESTRICT"))
    hole_number: Mapped[int] = mapped_column(Integer)
    strokes: Mapped[int] = mapped_column(Integer)
    putts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fairway: Mapped[str | None] = mapped_column(String(20), nullable=True)

    round: Mapped[Round] = relationship(back_populates="scores")


class Disc(Base):
    __tablename__ = "discs"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"))
    manufacturer: Mapped[str] = mapped_column(String(60), default="")
    mold: Mapped[str] = mapped_column(String(60))
    plastic: Mapped[str] = mapped_column(String(60), default="")
    disc_type: Mapped[str] = mapped_column(String(20), default="midrange")
    speed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    glide: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turn: Mapped[float | None] = mapped_column(Float, nullable=True)
    fade: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight: Mapped[int | None] = mapped_column(Integer, nullable=True)
    color: Mapped[str] = mapped_column(String(40), default="")
    in_bag: Mapped[bool] = mapped_column(Boolean, default=True)
    lost: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    player: Mapped[Player] = relationship(back_populates="discs")
