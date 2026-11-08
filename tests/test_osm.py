from app.osm import course_from_nominatim


def test_nominatim_course_uses_town_and_state():
    course = course_from_nominatim(
        {
            "osm_type": "way",
            "osm_id": 1031657125,
            "lat": "40.1644201",
            "lon": "-76.3179127",
            "category": "leisure",
            "type": "disc_golf_course",
            "name": "TAIT Disc Golf",
            "address": {
                "town": "Lititz",
                "state": "Pennsylvania",
                "ISO3166-2-lvl4": "US-PA",
                "country_code": "us",
            },
            "extratags": {},
        }
    )
    assert course is not None
    assert course["name"] == "TAIT Disc Golf"
    assert course["city"] == "Lititz"
    assert course["region"] == "PA"
    assert course["country"] == "United States"
    assert course["external_id"] == "way/1031657125"
    assert course["hole_count"] == 18


def test_nominatim_ignores_other_places():
    assert course_from_nominatim({"category": "place", "type": "town", "name": "Lititz", "osm_type": "node", "osm_id": 1}) is None
