def test_backup_round_trip_and_reject(client):
    player = client.post("/api/players", json={"name": "Alex"}).json()
    sam = client.post("/api/players", json={"name": "Sam"}).json()
    course = client.get("/api/courses", params={"q": "Trinity at Good Hops"}).json()[0]
    detail = client.get(f"/api/courses/{course['id']}").json()
    layout_id = detail["layouts"][0]["id"]
    started = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout_id, "player_ids": [player["id"], sam["id"]]},
    )
    assert started.status_code == 201, started.text
    round_id = started.json()["id"]
    scored = client.put(
        f"/api/rounds/{round_id}/scores",
        json={"player_id": player["id"], "hole_number": 1, "strokes": 2, "fairway": "hit"},
    )
    assert scored.status_code == 200, scored.text
    disc = client.post(
        "/api/discs",
        json={"player_id": player["id"], "mold": "Aviar", "disc_type": "putter", "in_bag": True},
    )
    assert disc.status_code == 201, disc.text

    exported = client.get("/api/admin/export")
    assert exported.status_code == 200, exported.text
    payload = exported.json()
    assert payload["format"] == "dolf-backup"
    assert any(item["name"] == "Alex" for item in payload["players"])
    assert any(item["mold"] == "Aviar" for item in payload["discs"])

    renamed = client.patch(f"/api/players/{player['id']}", json={"name": "Alexis"})
    assert renamed.status_code == 200

    rejected = client.post("/api/admin/import", json={"format": "nope"})
    assert rejected.status_code == 422
    still = client.get("/api/players")
    assert any(item["name"] == "Alexis" for item in still.json())

    restored = client.post("/api/admin/import", json=payload)
    assert restored.status_code == 200, restored.text
    assert restored.json()["rounds"] >= 1
    names = {item["name"] for item in client.get("/api/players").json()}
    assert "Alex" in names
    assert "Alexis" not in names
    rounds = client.get("/api/rounds", params={"player_id": player["id"]}).json()
    assert rounds
    again = client.get(f"/api/rounds/{rounds[0]['id']}").json()
    alex_score = next(score for score in again["scores"] if score["player_id"] == player["id"])
    assert alex_score["strokes"] == 2
    assert alex_score["fairway"] == "hit"
    discs = client.get("/api/discs", params={"player_id": player["id"]}).json()
    assert discs[0]["mold"] == "Aviar"
    summary = client.get("/api/admin/summary")
    assert summary.status_code == 200
    assert summary.json()["courses"] >= 1


def test_admin_removes_player_and_keeps_a_shared_card(client):
    alex = client.post("/api/players", json={"name": "Alex"}).json()
    sam = client.post("/api/players", json={"name": "Sam"}).json()
    course = client.get("/api/courses", params={"q": "Arrowhead Park"}).json()[0]
    detail = client.get(f"/api/courses/{course['id']}").json()
    layout_id = detail["layouts"][0]["id"]
    started = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout_id, "player_ids": [alex["id"], sam["id"]]},
    )
    round_id = started.json()["id"]
    client.put(
        f"/api/rounds/{round_id}/scores",
        json={"player_id": alex["id"], "hole_number": 1, "strokes": 3},
    )
    client.put(
        f"/api/rounds/{round_id}/scores",
        json={"player_id": sam["id"], "hole_number": 1, "strokes": 4},
    )
    removed = client.delete(f"/api/admin/players/{alex['id']}")
    assert removed.status_code == 204, removed.text
    names = {item["name"] for item in client.get("/api/players").json()}
    assert "Alex" not in names
    card = client.get(f"/api/rounds/{round_id}")
    assert card.status_code == 200, card.text
    body = card.json()
    assert [player["name"] for player in body["players"]] == ["Sam"]
    assert [score["strokes"] for score in body["scores"]] == [4]

    alone = client.post(
        "/api/rounds",
        json={"course_id": course["id"], "layout_id": layout_id, "player_ids": [sam["id"]]},
    )
    alone_id = alone.json()["id"]
    client.delete(f"/api/admin/players/{sam['id']}")
    assert client.get(f"/api/rounds/{alone_id}").status_code == 404
    assert client.get(f"/api/rounds/{round_id}").status_code == 404


def test_review_delete_and_admin_page(client):
    player = client.post("/api/players", json={"name": "Riley"}).json()
    course = client.get("/api/courses", params={"q": "Castle Hayne"}).json()[0]
    detail = client.get(f"/api/courses/{course['id']}").json()
    review = client.post(
        f"/api/courses/{course['id']}/reviews",
        json={"player_id": player["id"], "rating": 5, "conditions": "great", "body": "Concrete pads."},
    )
    assert review.status_code == 201
    review_id = review.json()["reviews"][0]["id"]
    deleted = client.delete(f"/api/reviews/{review_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/courses/{course['id']}").json()["reviews"] == []

    page = client.get("/admin")
    assert page.status_code == 200
    assert "/static/js/app.js" in page.text
    script = client.get("/static/js/app.js")
    assert "Export full backup" in script.text
    assert "import-word" in script.text
    missing = client.delete(f"/api/reviews/{review_id}")
    assert missing.status_code == 404
    assert detail["layouts"]
