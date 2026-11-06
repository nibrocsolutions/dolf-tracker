from pydantic import BaseModel, Field, field_validator, model_validator

from app.serialize import FLAG_FIELDS, flag_to_bool

CONDITIONS = {"great", "good", "fair", "poor", "closed"}
FAIRWAYS = {"hit", "left", "right", "parked"}
DISC_TYPES = {"putter", "midrange", "fairway", "distance"}
FLAG_VALUES = {"yes", "no", "unknown"}


class PlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Enter a name.")
        return cleaned


class CourseWrite(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(default="", max_length=80)
    region: str = Field(default="", max_length=80)
    country: str = Field(default="United States", max_length=80)
    address: str = Field(default="", max_length=200)
    latitude: float | None = None
    longitude: float | None = None
    description: str = Field(default="", max_length=2000)
    website: str = Field(default="", max_length=300)
    tee_type: str = Field(default="", max_length=40)
    target_type: str = Field(default="", max_length=40)
    foliage: str = Field(default="", max_length=40)
    dog_friendly: str = "unknown"
    family_friendly: str = "unknown"
    beginner_friendly: str = "unknown"
    scenic: str = "unknown"
    accessible: str = "unknown"
    bathrooms: str = "unknown"
    cart_friendly: str = "unknown"
    pay_to_play: str = "unknown"
    hole_count: int = Field(default=18, ge=1, le=36)

    @field_validator("name", "city", "region", "country", "address", "tee_type", "target_type", "foliage")
    @classmethod
    def strip_short(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("description")
    @classmethod
    def strip_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("website")
    @classmethod
    def clean_website(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            return ""
        if not cleaned.startswith(("http://", "https://")):
            raise ValueError("Website must start with http:// or https://")
        return cleaned

    @field_validator(*FLAG_FIELDS)
    @classmethod
    def check_flag(cls, value: str) -> str:
        if value not in FLAG_VALUES:
            raise ValueError("Choose yes, no, or unknown.")
        return value

    @model_validator(mode="after")
    def check_coordinates(self):
        if self.latitude is not None and not -90 <= self.latitude <= 90:
            raise ValueError("Latitude must be between -90 and 90.")
        if self.longitude is not None and not -180 <= self.longitude <= 180:
            raise ValueError("Longitude must be between -180 and 180.")
        return self

    def flag_kwargs(self) -> dict[str, bool | None]:
        return {field: flag_to_bool(getattr(self, field)) for field in FLAG_FIELDS}


class HoleIn(BaseModel):
    par: int = Field(ge=2, le=6)
    distance_ft: int | None = Field(default=None, ge=1, le=2000)
    notes: str = Field(default="", max_length=300)

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip()


class LayoutWrite(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    notes: str = Field(default="", max_length=1000)
    holes: list[HoleIn] = Field(min_length=1, max_length=36)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Name the layout.")
        return cleaned

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip()


class ReviewIn(BaseModel):
    player_id: int
    rating: int = Field(ge=1, le=5)
    conditions: str = "good"
    body: str = Field(default="", max_length=1000)

    @field_validator("conditions")
    @classmethod
    def check_conditions(cls, value: str) -> str:
        if value not in CONDITIONS:
            raise ValueError("Conditions must be great, good, fair, poor, or closed.")
        return value

    @field_validator("body")
    @classmethod
    def strip_body(cls, value: str) -> str:
        return value.strip()


class ImportCourse(BaseModel):
    external_id: str = Field(min_length=3, max_length=80)
    name: str = Field(min_length=1, max_length=120)
    city: str = Field(default="", max_length=80)
    region: str = Field(default="", max_length=80)
    country: str = Field(default="", max_length=80)
    latitude: float | None = None
    longitude: float | None = None
    description: str = Field(default="", max_length=500)
    website: str = Field(default="", max_length=300)
    hole_count: int = Field(default=18, ge=1, le=36)

    @field_validator("external_id")
    @classmethod
    def check_external(cls, value: str) -> str:
        kind, _, raw_id = value.partition("/")
        if kind not in {"node", "way", "relation"} or not raw_id.isdigit():
            raise ValueError("Unrecognized map id.")
        return value

    @field_validator("name", "city", "region", "country")
    @classmethod
    def strip_short(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("website")
    @classmethod
    def clean_website(cls, value: str) -> str:
        cleaned = value.strip()
        if cleaned and not cleaned.startswith(("http://", "https://")):
            return ""
        return cleaned


class RoundCreate(BaseModel):
    course_id: int
    layout_id: int
    player_ids: list[int] = Field(min_length=1, max_length=12)
    notes: str = Field(default="", max_length=2000)
    weather: str = Field(default="", max_length=40)
    hide_totals: bool = False

    @field_validator("player_ids")
    @classmethod
    def unique_players(cls, value: list[int]) -> list[int]:
        if len(set(value)) != len(value):
            raise ValueError("A player can only be on the card once.")
        return value

    @field_validator("notes", "weather")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class RoundPatch(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
    weather: str | None = Field(default=None, max_length=40)
    hide_totals: bool | None = None
    layout_id: int | None = None

    @field_validator("notes", "weather")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()


class RoundPlayerIn(BaseModel):
    player_id: int


class RoundOrder(BaseModel):
    player_ids: list[int] = Field(min_length=1, max_length=12)


class ScoreIn(BaseModel):
    player_id: int
    hole_number: int = Field(ge=1, le=36)
    strokes: int | None = Field(default=None, ge=1, le=20)
    putts: int | None = Field(default=None, ge=0, le=12)
    fairway: str | None = None

    @field_validator("fairway")
    @classmethod
    def check_fairway(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return None
        if value not in FAIRWAYS:
            raise ValueError("Fairway must be hit, left, right, or parked.")
        return value


class DiscWrite(BaseModel):
    player_id: int
    manufacturer: str = Field(default="", max_length=60)
    mold: str = Field(min_length=1, max_length=60)
    plastic: str = Field(default="", max_length=60)
    disc_type: str = "midrange"
    speed: int | None = Field(default=None, ge=1, le=15)
    glide: int | None = Field(default=None, ge=1, le=7)
    turn: float | None = Field(default=None, ge=-5, le=5)
    fade: float | None = Field(default=None, ge=0, le=6)
    weight: int | None = Field(default=None, ge=100, le=200)
    color: str = Field(default="", max_length=40)
    in_bag: bool = True
    lost: bool = False
    notes: str = Field(default="", max_length=500)

    @field_validator("manufacturer", "mold", "plastic", "color")
    @classmethod
    def strip_short(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("disc_type")
    @classmethod
    def check_type(cls, value: str) -> str:
        if value not in DISC_TYPES:
            raise ValueError("Type must be putter, midrange, fairway, or distance.")
        return value

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip()


class DiscPatch(BaseModel):
    manufacturer: str | None = Field(default=None, max_length=60)
    mold: str | None = Field(default=None, max_length=60)
    plastic: str | None = Field(default=None, max_length=60)
    disc_type: str | None = None
    speed: int | None = Field(default=None, ge=1, le=15)
    glide: int | None = Field(default=None, ge=1, le=7)
    turn: float | None = Field(default=None, ge=-5, le=5)
    fade: float | None = Field(default=None, ge=0, le=6)
    weight: int | None = Field(default=None, ge=100, le=200)
    color: str | None = Field(default=None, max_length=40)
    in_bag: bool | None = None
    lost: bool | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("manufacturer", "mold", "plastic", "color", "notes")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()

    @field_validator("disc_type")
    @classmethod
    def check_type(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if value not in DISC_TYPES:
            raise ValueError("Type must be putter, midrange, fairway, or distance.")
        return value
