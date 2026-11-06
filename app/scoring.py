from collections import Counter
from typing import NamedTuple, Sequence


RESULT_KEYS = ("ace", "albatross", "eagle", "birdie", "par", "bogey", "double", "worse")


class Thrower(NamedTuple):
    id: int
    name: str


def hole_result(strokes: int, par: int) -> str:
    if strokes < 1:
        raise ValueError("strokes must be at least 1")
    if par < 2:
        raise ValueError("par must be at least 2")
    if strokes == 1:
        return "ace"
    diff = strokes - par
    if diff <= -3:
        return "albatross"
    if diff == -2:
        return "eagle"
    if diff == -1:
        return "birdie"
    if diff == 0:
        return "par"
    if diff == 1:
        return "bogey"
    if diff == 2:
        return "double"
    return "worse"


def result_label(result: str) -> str:
    labels = {
        "ace": "Ace",
        "albatross": "Albatross",
        "eagle": "Eagle",
        "birdie": "Birdie",
        "par": "Par",
        "bogey": "Bogey",
        "double": "Double",
        "worse": "Triple+",
    }
    return labels.get(result, result)


def format_vs(diff: int) -> str:
    if diff == 0:
        return "E"
    if diff > 0:
        return f"+{diff}"
    return str(diff)


def tally(pairs: Sequence[tuple[int, int]]) -> dict[str, int]:
    counts = Counter(hole_result(strokes, par) for strokes, par in pairs)
    return {key: counts.get(key, 0) for key in RESULT_KEYS}


def throwing_order(
    players: Sequence[Thrower],
    scores: dict[tuple[int, int], int],
    hole: int,
) -> list[Thrower]:
    """PDGA-style order: hole 1 follows the card. Later holes follow the previous hole's score."""
    ordered = list(players)
    if hole <= 1:
        return ordered

    previous = hole - 1

    def sort_key(item: tuple[int, Thrower]) -> tuple[bool, int, int]:
        index, player = item
        strokes = scores.get((player.id, previous))
        missing = strokes is None
        return (missing, 0 if strokes is None else strokes, index)

    return [player for _, player in sorted(enumerate(ordered), key=sort_key)]
