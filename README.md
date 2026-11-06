# Dolf

A phone-friendly disc golf scorekeeper for a Raspberry Pi. Keep a live scorecard, browse courses and layouts, review conditions, and look back at aces, birdies, and your average against par. Open it in the phone's browser. There is no app store install.

Built the same way as the other Pi apps: one Python container, SQLite on a Docker volume, and a page served by that same container.

Dolf listens on **port 8092**. The other apps already use 8000 (government-tracker), 8081 (math-facts and trip-planner), 8085 (wifi-monitor), and 8088 (kinney-aviation).

## Quick start (Raspberry Pi or any Docker host)

```bash
git clone https://github.com/nibrocsolutions/dolf-tracker.git
cd dolf-tracker
docker compose up -d --build
```

On the phone, join the same Wi-Fi as the Pi and open `http://<pi-ip>:8092`.

Add it to the home screen (Safari: Share → Add to Home Screen, Chrome: menu → Add to Home screen) and it opens like an app.

### Useful commands

```bash
docker compose logs -f
git pull && docker compose up -d --build
docker compose down
```

`docker compose down` keeps the `dolf-data` volume. Add `-v` only when you mean to erase the scorecards.

## What you can do

- Start a round on a course and layout, with everyone on the card
- Tap a score for each hole. The running total, birdie, and bogey update as you go
- Leave the page and come back. A live round stays open until you finish it
- Hide the running score, leave a note, and mark weather
- See who throws next from the previous hole
- Optionally record putts and whether the drive was in the fairway, left, right, or parked
- Finish a round, reopen it, or delete it
- Read stats: average versus par, best round, aces, birdies, and a split by course
- Save courses you play, edit hole par and distance, and leave a condition note
- Search OpenStreetMap for courses by city or name, then set the pars yourself
- Keep the discs in your bag, with speed, glide, turn, and fade

The first launch includes five public courses around New Hanover County so there is something to play:

| Course | What is filled in |
| --- | --- |
| Joe Eakes Park, Kure Beach | Original yellow baskets, par 60, 5,280 ft. Alternate red baskets, par 62, 5,941 ft |
| UNCW Disc Golf Course | 9 baskets. Short tees par 28 / 1,734 ft, long tees par 28 / 2,461 ft, plus an 18-hole round that plays short then long |
| Trinity at Good Hops, Carolina Beach | 9 holes, par 27, 1,493 ft |
| Castle Hayne Park | Long baskets par 64 / 6,913 ft. Short baskets par 63 / 6,866 ft |
| Arrowhead Park, Wilmington | 18 par 3s, 3,577 ft |

Pars and distances come from public DGCR hole lists (Joe Eakes updated June 24, 2021, Castle Hayne dated February 2, 2018, UNCW and Trinity from their course pages). Arrowhead uses the current 18-hole par-3 layout. A Pi that already has the first seed replaces those placeholder or outdated holes on the next start, and leaves a layout alone once you have edited it. If a pin has moved, edit the layout.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
mkdir -p data
DATA_DIR=./data uvicorn app.main:app --reload --host 0.0.0.0 --port 8092
```

Tests:

```bash
pytest
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET, POST | `/api/players` | Players on this Pi |
| PATCH, DELETE | `/api/players/{id}` | Rename or remove a player |
| GET, POST | `/api/courses` | Courses, with filters such as `beginner_friendly=true` |
| GET | `/api/courses/discover?q=` | Search OpenStreetMap |
| POST | `/api/courses/import` | Save a course from that search |
| GET, PATCH, DELETE | `/api/courses/{id}` | One course |
| POST | `/api/courses/{id}/layouts` | Add a layout |
| PUT, DELETE | `/api/layouts/{id}` | Edit or remove a layout |
| POST | `/api/courses/{id}/reviews` | Rating and conditions |
| GET, POST | `/api/rounds` | Live and finished rounds |
| GET, PATCH, DELETE | `/api/rounds/{id}` | One scorecard |
| POST | `/api/rounds/{id}/finish` | Finish |
| POST | `/api/rounds/{id}/reopen` | Keep scoring |
| PUT | `/api/rounds/{id}/scores` | Set or clear a hole |
| PUT | `/api/rounds/{id}/order` | Tee order for hole 1 |
| GET | `/api/stats?player_id=` | Averages, aces, and course splits |
| GET, POST | `/api/discs` | A player's bag |
| PATCH, DELETE | `/api/discs/{id}` | Edit or remove a disc |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `./data` locally, `/data` in Docker | SQLite directory |
| `PORT` | `8092` | HTTP port |
| `SEED_DEMO` | `1` | Load the starter courses when the database is empty |
| `DATABASE_URL` | `sqlite:///{DATA_DIR}/dolf.db` | Override the database |

## Notes

- Anyone who can open the address can read and change the scorecards. Keep it on your home network. Do not forward port 8092 to the internet.
- The phone has to reach the Pi. On the same Wi-Fi, use the Pi's address. Away from home, use a VPN you already trust. The page itself does not need a store account.
- Map search calls OpenStreetMap's public Nominatim and Overpass services. The scorecard, stats, and bag work with no internet.
- Phone GPS is not used. Browsers only share a location over HTTPS, and this app is plain HTTP on the LAN. Search by city instead.
- The image is the multi-arch `python:3.12-slim` image, so it runs on a 64-bit Raspberry Pi and on a normal PC.

## Project layout

```
├── Dockerfile
├── docker-compose.yml
├── app/
│   ├── main.py
│   ├── api/routes.py
│   ├── models.py
│   ├── scoring.py
│   ├── seed.py
│   └── static/
└── tests/
```
