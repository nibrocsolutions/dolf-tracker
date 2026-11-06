def _player(client, name="Alex"):
    created = client.post("/api/players", json={"name": name})
    assert created.status_code == 201, created.text
    return created.json()


def _course_by_name(client, name):
    found = client.get("/api/courses", params={"q": name})
    assert found.status_code == 200
    match = next(course for course in found.json() if course["name"] == name)
    return client.get(f"/api/courses/{match['id']}").json()


def test_health_and_home_page(client):
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    page = client.get("/")
    assert page.status_code == 200
    assert "viewport" in page.text
    assert "Dolf" in page.text
    assert 'name="apple-mobile-web-app-capable"' in page.text


def test_seeded_local_courses(client):
    joe = _course_by_name(client, "Joe Eakes Park")
    layout = joe["layouts"][0]
    assert layout["pars_confirmed"] is True
    assert sum(hole["par"] for hole in layout["holes"]) == 61
    assert sum(hole["distance_ft"] for hole in layout["holes"]) == 5229

    uncw = _course_by_name(client, "UNCW Disc Golf Course")
    uncw_layout = uncw["layouts"][0]
    assert sum(hole["par"] for hole in uncw_layout["holes"]) == 54
    assert sum(hole["distance_ft"] for hole in uncw_layout["holes"]) == 4070

    trinity = _course_by_name(client, "Trinity at Good Hops")
    trinity_layout = trinity["layouts"][0]
    assert sum(hole["par"] for hole in trinity_layout["holes"]) == 54
    assert sum(hole["distance_ft"] for hole in trinity_layout["holes"]) == 2959

    castle = _course_by_name(client, "Castle Hayne Park")
    assert castle["layouts"][0]["pars_confirmed"] is False
    assert len(castle["layouts"][0]["holes"]) == 18
    assert castle["accessible"] == "yes"
    assert castle["pay_to_play"] == "no"


def test_round_scores_stats_and_tee_order(client):
    alex = _player(client, "Alex")
    sam = _player(client, "Sam")
    duplicate = client.post("/api/players", json={"name": " alex "})
    assert duplicate.status_code == 409

    course = _course_by_name(client, "Joe Eakes Park")
    layout = course["layouts"][0]
    started = client.post(
        "/api/rounds",
        json={
            "course_id": course["id"],
            "layout_id": layout["id"],
            "player_ids": [alex["id"], sam["id"]],
            "hide_totals": True,
            "weather": "Breezy",
        },
    )
    assert started.status_code == 201, started.text
    round_ = started.json()
    assert round_["hide_totals"] is True
    assert round_["tee_order_by_hole"]["1"] == [alex["id"], sam["id"]]

    ace = client.put(
        f"/api/rounds/{round_['id']}/scores",
        json={"player_id": alex["id"], "hole_number": 1, "strokes": 1, "putts": 0, "fairway": "parked"},
    )
    assert ace.status_code == 200, ace.text
    birdie = client.put(
        f"/api/rounds/{round_['id']}/scores",
        json={"player_id": sam["id"], "hole_number": 1, "strokes": 2},
    )
    assert birdie.status_code == 200
    body = birdie.json()
    assert body["tee_order_by_hole"]["2"] == [alex["id"], sam["id"]]
    alex_line = next(line for line in body["summary"] if line["player_id"] == alex["id"])
    assert alex_line["vs_par"] == -2
    assert alex_line["results"]["ace"] == 1

    hole_two = client.put(
        f"/api/rounds/{round_['id']}/scores",
        json={"player_id": sam["id"], "hole_number": 2, "strokes": 3},
    )
    # Alex has not scored hole 2, so Sam throws first on the next tee.
    assert hole_two.json()["tee_order_by_hole"]["3"][0] == sam["id"]

    finished = client.post(f"/api/rounds/{round_['id']}/finish")
    assert finished.status_code == 200
    assert finished.json()["status"] == "finished"
    blocked = client.put(
        f"/api/rounds/{round_['id']}/scores",
        json={"player_id": alex["id"], "hole_number": 2, "strokes": 3},
    )
    assert blocked.status_code == 409

    reopened = client.post(f"/api/rounds/{round_['id']}/reopen")
    assert reopened.json()["status"] == "live"
    client.post(f"/api/rounds/{round_['id']}/finish")

    stats = client.get("/api/stats", params={"player_id": alex["id"]}).json()
    assert stats["rounds_scored"] == 1
    assert stats["results"]["ace"] == 1
    assert stats["average_vs_par"] == -2
    assert stats["best_round"]["course_name"] == "Joe Eakes Park"
    assert stats["aces"][0]["hole_number"] == 1
    assert stats["parked"] == 1
    assert stats["courses"][0]["name"] == "Joe Eakes Park"


def test_layout_review_disc_and_delete_guard(client):
    player = _player(client, "Riley")
    course = _course_by_name(client, "Arrowhead Park")
    layout_id = course["layouts"][0]["id"]
    updated = client.put(
        f"/api/layouts/{layout_id}",
        json={
            "name": "Main",
            "notes": "Checked against the tee signs.",
            "holes": [{"par": 3, "distance_ft": 180, "notes": "Hyzer"}] * 9,
        },
    )
    assert updated.status_code == 200, updated.text
    layout = updated.json()["layouts"][0]
    assert layout["pars_confirmed"] is True
    assert layout["par"] == 27
    assert layout["holes"][0]["notes"] == "Hyzer"
    assert len(layout["holes"]) == 9

    review = client.post(
        f"/api/courses/{course['id']}/reviews",
        json={"player_id": player["id"], "rating": 4, "conditions": "good", "body": "Short and wooded."},
    )
    assert review.status_code == 201
    assert review.json()["rating"] == 4.0
    assert review.json()["conditions"] == "good"

    started = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout_id, "player_ids": [player["id"]]},
    )
    assert started.status_code == 201
    blocked = client.delete(f"/api/courses/{course['id']}")
    assert blocked.status_code == 409

    disc = client.post(
        "/api/discs",
        json={
            "player_id": player["id"],
            "manufacturer": "Innova",
            "mold": "Aviar",
            "plastic": "DX",
            "disc_type": "putter",
            "speed": 2,
            "glide": 3,
            "turn": 0,
            "fade": 1,
            "weight": 175,
            "color": "white",
            "in_bag": True,
        },
    )
    assert disc.status_code == 201, disc.text
    listed = client.get("/api/discs", params={"player_id": player["id"]})
    assert listed.json()[0]["mold"] == "Aviar"
    removed = client.delete(f"/api/discs/{disc.json()['id']}")
    assert removed.status_code == 204


def test_filters_and_map_import(client, monkeypatch):
    beginners = client.get("/api/courses", params={"beginner_friendly": True})
    names = {course["name"] for course in beginners.json()}
    assert "UNCW Disc Golf Course" in names
    assert "Joe Eakes Park" not in names

    def fake_discover(query):
        assert "Wilmington" in query
        return [
            {
                "external_id": "node/42",
                "name": "Sample DGC",
                "city": "Wilmington",
                "region": "NC",
                "country": "US",
                "latitude": 34.2,
                "longitude": -77.9,
                "description": "",
                "website": "",
                "hole_count": 9,
            }
        ]

    monkeypatch.setattr("app.api.routes.discover", fake_discover)
    found = client.get("/api/courses/discover", params={"q": "Wilmington"})
    assert found.status_code == 200, found.text
    assert found.json()[0]["imported"] is False

    saved = client.post("/api/courses/import", json=found.json()[0])
    assert saved.status_code == 201, saved.text
    assert saved.json()["name"] == "Sample DGC"
    assert saved.json()["layouts"][0]["pars_confirmed"] is False
    assert len(saved.json()["layouts"][0]["holes"]) == 9

    again = client.post("/api/courses/import", json=found.json()[0])
    assert again.json()["id"] == saved.json()["id"]


def test_clear_score_and_player_order(client):
    alex = _player(client, "Alex")
    sam = _player(client, "Sam")
    course = _course_by_name(client, "Trinity at Good Hops")
    layout = course["layouts"][0]
    started = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout["id"], "player_ids": [alex["id"], sam["id"]]},
    ).json()
    client.put(
        f"/api/rounds/{started['id']}/scores",
        json={"player_id": alex["id"], "hole_number": 1, "strokes": 3},
    )
    cleared = client.put(
        f"/api/rounds/{started['id']}/scores",
        json={"player_id": alex["id"], "hole_number": 1, "strokes": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["scores"] == []

    ordered = client.put(
        f"/api/rounds/{started['id']}/order",
        json={"player_ids": [sam["id"], alex["id"]]},
    )
    assert [player["id"] for player in ordered.json()["players"]] == [sam["id"], alex["id"]]
    assert ordered.json()["tee_order_by_hole"]["1"] == [sam["id"], alex["id"]]
