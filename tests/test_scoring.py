import pytest

from app.scoring import Thrower, format_vs, hole_result, tally, throwing_order


def test_hole_results():
    assert hole_result(1, 3) == "ace"
    assert hole_result(1, 4) == "ace"
    assert hole_result(2, 5) == "albatross"
    assert hole_result(2, 4) == "eagle"
    assert hole_result(2, 3) == "birdie"
    assert hole_result(3, 3) == "par"
    assert hole_result(4, 3) == "bogey"
    assert hole_result(5, 3) == "double"
    assert hole_result(6, 3) == "worse"


def test_format_and_tally():
    assert format_vs(0) == "E"
    assert format_vs(-2) == "-2"
    assert format_vs(3) == "+3"
    assert tally([(1, 3), (3, 3), (5, 3)]) == {
        "ace": 1,
        "albatross": 0,
        "eagle": 0,
        "birdie": 0,
        "par": 1,
        "bogey": 0,
        "double": 1,
        "worse": 0,
    }


def test_throwing_order_follows_previous_hole():
    players = [Thrower(1, "Alex"), Thrower(2, "Sam"), Thrower(3, "Jo")]
    assert [player.name for player in throwing_order(players, {}, 1)] == ["Alex", "Sam", "Jo"]
    scores = {(1, 1): 3, (2, 1): 2, (3, 1): 3}
    assert [player.name for player in throwing_order(players, scores, 2)] == ["Sam", "Alex", "Jo"]
    partial = {(1, 1): 3, (2, 1): 4}
    assert [player.name for player in throwing_order(players, partial, 2)] == ["Alex", "Sam", "Jo"]


def test_hole_result_rejects_bad_numbers():
    with pytest.raises(ValueError):
        hole_result(0, 3)
    with pytest.raises(ValueError):
        hole_result(2, 1)
