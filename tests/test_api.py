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


def _par_distance(layout):
    return (
        sum(hole["par"] for hole in layout["holes"]),
        sum(hole["distance_ft"] for hole in layout["holes"]),
    )


def test_seeded_local_courses(client):
    joe = _course_by_name(client, "Joe Eakes Park")
    by_name = {layout["name"]: layout for layout in joe["layouts"]}
    assert joe["layouts"][0]["name"] == "Original"
    assert _par_distance(by_name["Original"]) == (60, 5280)
    assert by_name["Original"]["holes"][0]["distance_ft"] == 310
    assert _par_distance(by_name["Alternate"]) == (62, 5941)
    assert joe["dog_friendly"] == "yes"
    assert joe["pay_to_play"] == "no"

    uncw = _course_by_name(client, "UNCW Disc Golf Course")
    uncw_layouts = {layout["name"]: layout for layout in uncw["layouts"]}
    assert _par_distance(uncw_layouts["Short then long"]) == (56, 4195)
    assert _par_distance(uncw_layouts["Short tees"]) == (28, 1734)
    assert _par_distance(uncw_layouts["Long tees"]) == (28, 2461)
    assert "Hamilton" in uncw["address"]

    trinity = _course_by_name(client, "Trinity at Good Hops")
    assert len(trinity["layouts"][0]["holes"]) == 9
    assert _par_distance(trinity["layouts"][0]) == (27, 1493)

    castle = _course_by_name(client, "Castle Hayne Park")
    castle_layouts = {layout["name"]: layout for layout in castle["layouts"]}
    assert castle["layouts"][0]["name"] == "Long baskets"
    assert castle_layouts["Long baskets"]["pars_confirmed"] is True
    assert _par_distance(castle_layouts["Long baskets"]) == (64, 6913)
    assert _par_distance(castle_layouts["Short baskets"]) == (63, 6866)
    assert castle["accessible"] == "yes"
    assert castle["pay_to_play"] == "no"

    arrowhead = _course_by_name(client, "Arrowhead Park")
    assert arrowhead["layouts"][0]["pars_confirmed"] is True
    assert _par_distance(arrowhead["layouts"][0]) == (54, 3577)
    assert "Mando" in arrowhead["layouts"][0]["holes"][10]["notes"]
    assert arrowhead["latitude"] == 34.1366


def test_sync_repairs_old_holes_and_keeps_scored_ones(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import Course, Hole, HoleScore, Player, Round, RoundPlayer
    from app.seed import OLD_SIGNATURES, sync_published_courses

    db = SessionLocal()
    joe = db.scalar(select(Course).where(Course.external_id == "seed/joe-eakes"))
    original = next(layout for layout in joe.layouts if layout.name == "Original")
    original.name = "Main"
    for hole in list(original.holes):
        db.delete(hole)
    db.flush()
    old_rows = next(iter(OLD_SIGNATURES["seed/joe-eakes"]))
    for number, (par, distance) in enumerate(old_rows, start=1):
        original.holes.append(Hole(number=number, par=par, distance_ft=distance, notes=""))
    db.commit()
    sync_published_courses(db)
    db.commit()
    db.refresh(original)
    assert original.name == "Original"
    assert sum(hole.par for hole in original.holes) == 60
    assert sum(hole.distance_ft for hole in original.holes) == 5280

    trinity = db.scalar(select(Course).where(Course.external_id == "seed/trinity-good-hops"))
    layout = trinity.layouts[0]
    layout.pars_confirmed = False
    for number in range(10, 19):
        layout.holes.append(Hole(number=number, par=3, distance_ft=100, notes=""))
    player = Player(name="Pat")
    db.add(player)
    db.flush()
    played = Round(course_id=trinity.id, layout_id=layout.id, status="live")
    played.players.append(RoundPlayer(player_id=player.id, tee_order=1))
    played.scores.append(HoleScore(player_id=player.id, hole_number=10, strokes=3))
    db.add(played)
    db.commit()
    layout_id = layout.id
    sync_published_courses(db)
    db.commit()
    db.expire_all()
    kept = db.get(Course, trinity.id).layouts
    kept_layout = next(item for item in kept if item.id == layout_id)
    assert len(kept_layout.holes) == 18
    db.close()


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


def test_finished_round_shows_par_for_holes_played_without_a_saved_row(client):
    player = _player(client, "Pat")
    course = _course_by_name(client, "Trinity at Good Hops")
    layout = course["layouts"][0]
    pars = {hole["number"]: hole["par"] for hole in layout["holes"]}
    started = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout["id"], "player_ids": [player["id"]]},
    )
    assert started.status_code == 201, started.text
    round_id = started.json()["id"]
    client.put(
        f"/api/rounds/{round_id}/scores",
        json={"player_id": player["id"], "hole_number": 1, "strokes": pars[1] + 1},
    )
    client.put(
        f"/api/rounds/{round_id}/scores",
        json={"player_id": player["id"], "hole_number": 3, "strokes": pars[3] - 1},
    )
    live = client.get(f"/api/rounds/{round_id}")
    live_holes = {score["hole_number"] for score in live.json()["scores"]}
    assert live_holes == {1, 3}

    finished = client.post(f"/api/rounds/{round_id}/finish")
    assert finished.status_code == 200, finished.text
    scores = {score["hole_number"]: score for score in finished.json()["scores"] if score["player_id"] == player["id"]}
    assert scores[1]["strokes"] == pars[1] + 1
    assert scores[2]["strokes"] == pars[2]
    assert scores[2]["vs_par"] == 0
    assert scores[3]["strokes"] == pars[3] - 1
    assert 4 not in scores

    again = client.get(f"/api/rounds/{round_id}").json()
    again_scores = {score["hole_number"]: score["strokes"] for score in again["scores"]}
    assert again_scores[2] == pars[2]
    assert 4 not in again_scores


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


def test_us_catalog_search_keeps_local_courses_and_mapped_pars(client):
    from app.database import SessionLocal
    from app.seed import seed_catalog

    db = SessionLocal()
    try:
        added = seed_catalog(db)
    finally:
        db.close()
    assert added > 4000

    local = client.get("/api/courses")
    assert local.status_code == 200
    names = {course["name"] for course in local.json()}
    assert "Joe Eakes Park" in names
    assert "Deer Lakes Park" not in names
    assert all(course["source"] != "catalog" for course in local.json())

    found = client.get("/api/courses", params={"q": "Deer Lakes"})
    match = next(course for course in found.json() if course["name"] == "Deer Lakes Park")
    assert match["city"] == "Tarentum"
    assert match["region"] == "PA"
    assert match["layouts"][0]["pars_confirmed"] is True
    assert match["layouts"][0]["hole_count"] == 18

    detail = client.get(f"/api/courses/{match['id']}").json()
    assert detail["layouts"][0]["holes"][0]["par"] == 4
    assert detail["layouts"][0]["holes"][0]["distance_ft"] == 488
    assert detail["layouts"][0]["pars_confirmed"] is True

    joes = [course for course in client.get("/api/courses", params={"q": "Joe Eakes"}).json() if "Joe Eakes" in course["name"]]
    assert len(joes) == 1
    assert joes[0]["source"] == "seed"
