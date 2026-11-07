const FLAGS = [
  ["dog_friendly", "Dogs welcome"],
  ["family_friendly", "Family-friendly"],
  ["beginner_friendly", "Beginner-friendly"],
  ["scenic", "Scenic"],
  ["accessible", "Accessible"],
  ["bathrooms", "Restrooms"],
  ["cart_friendly", "Cart-friendly"],
  ["pay_to_play", "Pay to play"],
];

const CHIPS = [
  ["beginner_friendly", "Beginner"],
  ["dog_friendly", "Dogs"],
  ["family_friendly", "Family"],
  ["scenic", "Scenic"],
  ["accessible", "Accessible"],
  ["bathrooms", "Restrooms"],
  ["cart_friendly", "Carts"],
  ["free", "Free"],
];

const CONDITIONS = [
  ["great", "Great"],
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor"],
  ["closed", "Closed"],
];

const WEATHER = ["", "Calm", "Breezy", "Windy", "Wet", "Hot", "Cold"];

const state = {
  players: [],
  playerId: null,
  tab: "home",
  screen: "home",
  course: null,
  courseList: [],
  layoutId: null,
  draft: null,
  round: null,
  live: [],
  recent: [],
  playerRounds: [],
  stats: null,
  discs: [],
  discId: null,
  discover: [],
  discoverQuery: "",
  courseFilter: "",
  filters: {},
  hole: 1,
  mode: "hole",
  showThrowStats: localStorage.getItem("dolfThrowStats") === "1",
  sheet: null,
  confirm: null,
  admin: null,
  startCourseId: null,
  error: "",
  notice: "",
  busy: false,
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function fmtVs(value) {
  if (value === 0) return "E";
  if (value > 0) return `+${value}`;
  return String(value);
}

function vsClass(value) {
  if (value < 0) return "under";
  if (value > 0) return "over";
  return "even";
}

function place(course) {
  return [course.city, course.region].filter(Boolean).join(", ");
}

function fmtFeet(value) {
  if (value == null) return "";
  return `${Number(value).toLocaleString()} ft`;
}

function fmtWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function safeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (err) {
    return "";
  }
  return "";
}

function me() {
  return state.players.find((player) => player.id === state.playerId) || null;
}

function setPlayer(id) {
  state.playerId = id;
  localStorage.setItem("dolfPlayerId", String(id));
}

async function api(path, options = {}) {
  const opts = { method: options.method || "GET", headers: {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  opts.signal = controller.signal;
  if (options.body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(path, opts);
  } catch (err) {
    throw new Error("That didn't go through. Try again.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let detail = "Something went wrong.";
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
      if (Array.isArray(detail)) {
        detail = detail.map((item) => item.msg || "").filter(Boolean).join(" ");
      }
    } catch (err) {
      detail = "Something went wrong.";
    }
    throw new Error(typeof detail === "string" ? detail : "Something went wrong.");
  }
  if (response.status === 204) return null;
  return response.json();
}

function filterQuery() {
  const params = new URLSearchParams();
  Object.entries(state.filters).forEach(([key, on]) => {
    if (!on) return;
    if (key === "free") params.set("pay_to_play", "false");
    else params.set(key, "true");
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

function filteredCourses() {
  const query = state.courseFilter.trim().toLowerCase();
  return state.courseList.filter((course) => {
    if (!query) return true;
    return `${course.name} ${course.city} ${course.region}`.toLowerCase().includes(query);
  });
}

async function applyHash() {
  const [a, b, c] = (location.hash || "#home").replace(/^#/, "").split("/");
  state.sheet = null;
  state.confirm = null;
  state.course = null;
  state.round = null;
  state.stats = null;
  state.layoutId = null;
  state.startCourseId = null;
  state.discId = null;

  if (a === "courses" && b) {
    state.tab = "courses";
    state.screen = "course";
    state.course = await api(`/api/courses/${b}`);
    return;
  }
  if (a === "rounds") {
    state.tab = "stats";
    state.screen = "rounds";
    state.playerRounds = await api(`/api/rounds?player_id=${state.playerId}`);
    return;
  }
  if (a === "play" && b) {
    state.tab = "play";
    state.screen = "round";
    state.round = await api(`/api/rounds/${b}`);
    state.mode = "hole";
    const maxHole = state.round.layout.holes.length || 1;
    const saved = Number(sessionStorage.getItem("dolfHole") || 1);
    state.hole = Math.min(Math.max(saved || 1, 1), maxHole);
    sessionStorage.setItem("dolfRound", String(state.round.id));
    return;
  }
  if (a === "layout" && b) {
    state.tab = "courses";
    state.screen = "layout";
    state.course = await api(`/api/courses/${b}`);
    state.layoutId = c && c !== "new" ? Number(c) : null;
    state.draft = null;
    return;
  }
  if (a === "edit" && b) {
    state.tab = "courses";
    state.screen = "form";
    state.course = await api(`/api/courses/${b}`);
    return;
  }
  if (a === "discover") {
    state.tab = "courses";
    state.screen = "discover";
    return;
  }
  if (a === "new-course") {
    state.tab = "courses";
    state.screen = "form";
    return;
  }
  if (a === "start") {
    state.tab = "play";
    state.screen = "start";
    state.players = await api("/api/players");
    state.courseList = await api("/api/courses");
    state.startCourseId = b ? Number(b) : (state.courseList[0] ? state.courseList[0].id : null);
    state.course = state.courseList.find((course) => course.id === state.startCourseId) || null;
    return;
  }
  if (a === "disc") {
    state.tab = "bag";
    state.screen = "disc";
    state.discId = b ? Number(b) : null;
    state.discs = await api(`/api/discs?player_id=${state.playerId}`);
    return;
  }

  const tabs = ["home", "courses", "play", "stats", "bag"];
  state.tab = tabs.includes(a) ? a : "home";
  state.screen = state.tab;
  if (state.tab === "home") {
    state.live = await api("/api/rounds?status=live");
    state.recent = await api(`/api/rounds?status=finished&player_id=${state.playerId}`);
    state.courseList = await api("/api/courses");
  } else if (state.tab === "courses") {
    state.courseList = await api(`/api/courses${filterQuery()}`);
  } else if (state.tab === "play") {
    state.live = await api("/api/rounds?status=live");
  } else if (state.tab === "stats") {
    state.stats = await api(`/api/stats?player_id=${state.playerId}`);
  } else if (state.tab === "bag") {
    state.discs = await api(`/api/discs?player_id=${state.playerId}`);
  }
}

async function navigate(hash, replace = false) {
  const next = `#${hash}`;
  if (location.hash !== next) {
    if (replace) history.replaceState(null, "", next);
    else history.pushState(null, "", next);
  }
  await applyHash();
}

async function run(work) {
  if (state.busy) return;
  state.busy = true;
  state.error = "";
  state.notice = "";
  render();
  try {
    await work();
  } catch (err) {
    state.error = err.message || "That didn't go through. Try again.";
    if (state.screen === "round" && state.round) {
      try {
        state.round = await api(`/api/rounds/${state.round.id}`);
      } catch (reloadErr) {
        /* keep the page that is already on screen */
      }
    }
  } finally {
    state.busy = false;
    const next = state.nextWork;
    state.nextWork = null;
    render();
    if (next) run(next);
  }
}

function paint() {
  render();
}

function courseCards(courses) {
  if (!courses.length) return `<p class="empty">No courses match. Search the map or add one.</p>`;
  return courses.map((course) => {
    const layout = course.layouts && course.layouts[0];
    const bits = [];
    if (place(course)) bits.push(place(course));
    if (layout) {
      bits.push(`${layout.holes.length} holes`);
      if (layout.pars_confirmed) bits.push(`par ${layout.par}`);
      if (layout.distance_ft) bits.push(fmtFeet(layout.distance_ft));
    }
    if (course.rating != null) bits.push(`${course.rating.toFixed(1)}★`);
    return `<button type="button" class="rowcard" data-go="courses/${course.id}">
      <span class="rowcard-title">${esc(course.name)}</span>
      <span class="muted">${esc(bits.join(" · "))}</span>
    </button>`;
  }).join("");
}

function flagFields(course) {
  return FLAGS.map(([key, label]) => {
    const value = course ? course[key] : "unknown";
    return `<label class="field">${esc(label)}
      <select name="${key}">
        ${["unknown", "yes", "no"].map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option === "unknown" ? "Not sure" : option === "yes" ? "Yes" : "No"}</option>`).join("")}
      </select>
    </label>`;
  }).join("");
}

function renderWelcome() {
  const picks = state.players.map((player) => (
    `<button type="button" class="secondary" data-act="pick-player" data-id="${player.id}">${esc(player.name)}</button>`
  )).join("");
  return `<section class="stack">
    <h1>Dolf</h1>
    <p class="lede">Keep score on the course, look up layouts, and track how your rounds are trending.</p>
    ${picks ? `<div class="stack">${picks}</div>` : ""}
    <form class="card stack" data-act="welcome">
      <label class="field">What should we call you?
        <input name="name" maxlength="40" required autocomplete="nickname" placeholder="Alex">
      </label>
      <button class="primary" type="submit">${picks ? "Add me" : "Start"}</button>
    </form>
  </section>`;
}

function header(title) {
  const person = me();
  return `<header class="top">
    ${title ? `<button type="button" class="back" data-act="back">Back</button>` : `<button type="button" class="brand" data-go="home"><span class="mark" aria-hidden="true"></span> Dolf</button>`}
    <button type="button" class="who" data-act="sheet" data-sheet="players">${esc(person ? person.name : "Player")}</button>
  </header>`;
}

function banners() {
  let html = "";
  if (state.error) html += `<p class="banner bad" role="alert">${esc(state.error)}</p>`;
  if (state.notice) html += `<p class="banner good">${esc(state.notice)}</p>`;
  return html;
}

function roundsHeading() {
  return `<h2><button type="button" class="section-link" data-go="rounds">Rounds <span aria-hidden="true">›</span></button></h2>`;
}

function roundSwipe(id, title, detail, courseName) {
  return `<div class="swipe">
    <button type="button" class="swipe-delete" data-act="ask-delete-round" data-id="${Number(id)}" data-name="${esc(courseName)}">Delete</button>
    <button type="button" class="rowcard swipe-face" data-go="play/${Number(id)}">
      <span class="rowcard-title">${esc(title)}</span>
      <span class="muted">${esc(detail)}</span>
    </button>
  </div>`;
}

function renderHome() {
  const live = state.live.map((round) => {
    const line = round.summary.find((item) => item.player_id === state.playerId) || round.summary[0];
    const total = round.hide_totals || !line || !line.holes_scored ? "" : ` · ${line.strokes} (${fmtVs(line.vs_par)})`;
    return roundSwipe(
      round.id,
      `Live · ${round.course.name}`,
      `${round.layout.name} · thru ${line ? line.thru : 0}${total}`,
      round.course.name,
    );
  }).join("");
  const recent = state.recent.slice(0, 5).map((round) => {
    const line = round.summary.find((item) => item.player_id === state.playerId) || round.summary[0];
    const total = line && line.holes_scored ? `${line.strokes} (${fmtVs(line.vs_par)})` : "No score";
    return roundSwipe(round.id, round.course.name, `${fmtWhen(round.started_at)} · ${total}`, round.course.name);
  }).join("");
  const courses = state.courseList.slice(0, 4);
  return `${header()}
    ${banners()}
    <section class="stack">
      <h1>Ready when you are</h1>
      <p class="lede">Scores, rounds, and discs are saved for each player.</p>
      <button type="button" class="primary" data-go="start">Start a round</button>
      ${live}
      ${roundsHeading()}
      ${recent || `<p class="empty">Finished rounds show up here.</p>`}
      <h2>Courses</h2>
      ${courseCards(courses)}
      <button type="button" class="secondary" data-go="courses">All courses</button>
    </section>`;
}

function renderCourses() {
  const chips = CHIPS.map(([key, label]) => (
    `<button type="button" class="chip ${state.filters[key] ? "on" : ""}" data-act="filter" data-filter="${key}">${esc(label)}</button>`
  )).join("");
  return `${header()}
    ${banners()}
    <section class="stack">
      <h1>Courses</h1>
      <input id="course-q" placeholder="Search name or town" value="${esc(state.courseFilter)}">
      <div class="chips">${chips}</div>
      <div class="inline">
        <button type="button" class="secondary" data-go="discover">Find on the map</button>
        <button type="button" class="secondary" data-go="new-course">Add course</button>
      </div>
      <div id="course-list" class="stack">${courseCards(filteredCourses())}</div>
    </section>`;
}

function renderCourse() {
  const course = state.course;
  const pills = [];
  FLAGS.forEach(([key, label]) => {
    if (key === "pay_to_play") return;
    if (course[key] === "yes") pills.push(`<span class="pill">${esc(label)}</span>`);
  });
  if (course.pay_to_play === "yes") pills.push(`<span class="pill pay">Pay to play</span>`);
  if (course.pay_to_play === "no") pills.push(`<span class="pill">Free</span>`);
  const map = safeUrl(course.latitude != null ? `https://www.openstreetmap.org/?mlat=${course.latitude}&mlon=${course.longitude}#map=16/${course.latitude}/${course.longitude}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${course.name} ${course.city}`)}`);
  const layouts = course.layouts.map((layout) => {
    const rows = layout.holes.map((hole) => (
      `<tr><td>${hole.number}</td><td>${hole.par}</td><td>${hole.distance_ft ? esc(fmtFeet(hole.distance_ft)) : "—"}</td></tr>`
    )).join("");
    return `<article class="card stack">
      <h2>${esc(layout.name)}</h2>
      <p class="muted">${layout.holes.length} holes${layout.pars_confirmed ? ` · par ${layout.par}` : ""}${layout.distance_ft ? ` · ${esc(fmtFeet(layout.distance_ft))}` : ""}</p>
      ${layout.pars_confirmed ? "" : `<p class="banner warn">Pars are still placeholders. Set them before you trust a score versus par.</p>`}
      ${layout.notes ? `<p>${esc(layout.notes)}</p>` : ""}
      <table class="hole-table"><thead><tr><th>Hole</th><th>Par</th><th>Distance</th></tr></thead><tbody>${rows}</tbody></table>
      <button type="button" class="secondary" data-go="layout/${course.id}/${layout.id}">Edit layout</button>
    </article>`;
  }).join("");
  const reviews = course.reviews.map((review) => (
    `<article class="card">
      <strong>${esc(review.player_name)}</strong> · ${review.rating}★ · ${esc(review.conditions)}
      <div class="muted">${esc(fmtWhen(review.created_at))}</div>
      ${review.body ? `<p>${esc(review.body)}</p>` : ""}
      ${review.player_id === state.playerId ? `<button type="button" class="secondary" data-act="ask-delete-review" data-id="${review.id}">Remove note</button>` : ""}
    </article>`
  )).join("");
  const site = safeUrl(course.website);
  return `${header("course")}
    ${banners()}
    <section class="stack">
      <h1>${esc(course.name)}</h1>
      <p class="muted">${esc(place(course) || "Location not set")}${course.rating != null ? ` · ${course.rating.toFixed(1)}★ (${course.rating_count})` : ""}</p>
      ${course.conditions ? `<p class="muted">Latest conditions: ${esc(course.conditions)}</p>` : ""}
      ${course.conditions === "closed" ? `<p class="banner bad">Last report says this course is closed.</p>` : ""}
      ${pills.length ? `<div class="pills">${pills.join("")}</div>` : ""}
      ${course.description ? `<p>${esc(course.description)}</p>` : ""}
      ${course.address ? `<p class="muted">${esc(course.address)}</p>` : ""}
      <div class="inline">
        <a class="secondary linkish" style="display:grid;place-items:center;text-decoration:none" href="${esc(map)}" target="_blank" rel="noopener">Map</a>
        <button type="button" class="primary" data-go="start/${course.id}">Play</button>
      </div>
      ${site ? `<a class="linkish" href="${esc(site)}" target="_blank" rel="noopener">Course website</a>` : ""}
      <div class="inline">
        <button type="button" class="secondary" data-go="edit/${course.id}">Edit course</button>
        <button type="button" class="secondary" data-go="layout/${course.id}/new">Add layout</button>
      </div>
      ${layouts || `<p class="empty">No layouts yet.</p>`}
      <h2>Conditions and reviews</h2>
      <form class="card stack" data-act="review">
        <label class="field">Rating
          <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n}</option>`).join("")}</select>
        </label>
        <label class="field">Conditions
          <select name="conditions">${CONDITIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
        </label>
        <label class="field">Note
          <textarea name="body" maxlength="1000" placeholder="Baskets, mud, wind, which pins were in"></textarea>
        </label>
        <button class="primary" type="submit">Save review</button>
      </form>
      ${reviews}
      <button type="button" class="danger" data-act="ask-delete-course" data-id="${course.id}" data-name="${esc(course.name)}">Delete course</button>
    </section>`;
}

function renderCourseForm() {
  const course = state.course;
  const value = (field, fallback = "") => esc(course && course[field] != null ? course[field] : fallback);
  return `${header("form")}
    ${banners()}
    <form class="stack" data-act="course">
      <h1>${course ? "Edit course" : "Add a course"}</h1>
      <label class="field">Name <input name="name" required maxlength="120" value="${value("name")}"></label>
      <div class="inline">
        <label class="field">City <input name="city" maxlength="80" value="${value("city")}"></label>
        <label class="field">State <input name="region" maxlength="80" value="${value("region")}"></label>
      </div>
      <label class="field">Address <input name="address" maxlength="200" value="${value("address")}"></label>
      <div class="inline">
        <label class="field">Latitude <input name="latitude" inputmode="decimal" value="${value("latitude")}"></label>
        <label class="field">Longitude <input name="longitude" inputmode="decimal" value="${value("longitude")}"></label>
      </div>
      ${course ? "" : `<label class="field">Holes <input name="hole_count" type="number" min="1" max="36" value="18"></label>`}
      <label class="field">Description <textarea name="description">${value("description")}</textarea></label>
      <label class="field">Website <input name="website" placeholder="https://" value="${value("website")}"></label>
      <div class="inline">
        <label class="field">Tees <input name="tee_type" value="${value("tee_type")}"></label>
        <label class="field">Baskets <input name="target_type" value="${value("target_type")}"></label>
      </div>
      <label class="field">Setting <input name="foliage" value="${value("foliage")}" placeholder="Wooded, open, mixed"></label>
      ${flagFields(course)}
      <button class="primary" type="submit">Save course</button>
    </form>`;
}

function ensureDraft() {
  if (!state.course) return;
  if (state.draft && state.draft.courseId === state.course.id && state.draft.layoutId === state.layoutId) return;
  const layout = state.layoutId ? state.course.layouts.find((item) => item.id === state.layoutId) : null;
  const holes = layout
    ? layout.holes.map((hole) => ({ par: hole.par, distance_ft: hole.distance_ft, notes: hole.notes || "" }))
    : Array.from({ length: 18 }, () => ({ par: 3, distance_ft: null, notes: "" }));
  state.draft = {
    courseId: state.course.id,
    layoutId: state.layoutId,
    name: layout ? layout.name : "Short",
    notes: layout ? layout.notes : "",
    holes,
  };
}

function renderLayout() {
  ensureDraft();
  const draft = state.draft;
  const rows = draft.holes.map((hole, index) => (
    `<div class="card stack">
      <strong>Hole ${index + 1}</strong>
      <div class="inline">
        <label class="field">Par
          <select data-hole-field="par" data-index="${index}">
            ${[2, 3, 4, 5, 6].map((par) => `<option value="${par}" ${Number(hole.par) === par ? "selected" : ""}>${par}</option>`).join("")}
          </select>
        </label>
        <label class="field">Feet
          <input data-hole-field="distance_ft" data-index="${index}" inputmode="numeric" value="${hole.distance_ft ?? ""}">
        </label>
      </div>
      <label class="field">Note
        <input data-hole-field="notes" data-index="${index}" maxlength="300" value="${esc(hole.notes || "")}">
      </label>
    </div>`
  )).join("");
  return `${header("layout")}
    ${banners()}
    <form class="stack" data-act="layout">
      <h1>${state.layoutId ? "Edit layout" : "New layout"}</h1>
      <label class="field">Name <input id="layout-name" required maxlength="80" value="${esc(draft.name)}"></label>
      <label class="field">Notes <textarea id="layout-notes">${esc(draft.notes)}</textarea></label>
      ${rows}
      <div class="inline">
        <button type="button" class="secondary" data-act="add-hole">Add hole</button>
        <button type="button" class="secondary" data-act="remove-hole">Remove last</button>
      </div>
      <button class="primary" type="submit">Save layout</button>
      ${state.layoutId ? `<button type="button" class="danger" data-act="ask-delete-layout" data-id="${state.layoutId}" data-course="${state.course.id}" data-name="${esc(draft.name)}">Delete layout</button>` : ""}
    </form>`;
}

function renderDiscover() {
  const results = state.discover.map((course, index) => (
    `<article class="card stack">
      <strong>${esc(course.name)}</strong>
      <span class="muted">${esc(place(course) || "Mapped course")} · ${course.hole_count} holes on the map tag</span>
      ${course.imported ? `<span class="muted">Already saved</span>` : `<button type="button" class="primary" data-act="import" data-index="${index}">Save course</button>`}
    </article>`
  )).join("");
  return `${header("discover")}
    ${banners()}
    <section class="stack">
      <h1>Find a course</h1>
      <p class="lede">Search OpenStreetMap by city or course name. Hole pars come back as placeholders until you set them.</p>
      <form class="stack" data-act="discover">
        <input name="q" required placeholder="Wilmington, NC" value="${esc(state.discoverQuery)}">
        <button class="primary" type="submit">Search maps</button>
      </form>
      ${results}
    </section>`;
}

function renderStart() {
  const courses = state.courseList;
  if (!courses.length) {
    return `${header("start")}
      ${banners()}
      <section class="stack">
        <h1>Start a round</h1>
        <p class="empty">Add a course first.</p>
        <button type="button" class="primary" data-go="new-course">Add course</button>
      </section>`;
  }
  const selected = state.course || courses[0];
  if (!selected.layouts.length) {
    return `${header("start")}
      ${banners()}
      <section class="stack">
        <h1>Start a round</h1>
        <p class="empty">${esc(selected.name)} has no layout yet.</p>
        <button type="button" class="primary" data-go="layout/${selected.id}/new">Add a layout</button>
      </section>`;
  }
  const courseOptions = courses.map((course) => (
    `<option value="${course.id}" ${course.id === selected.id ? "selected" : ""}>${esc(course.name)}</option>`
  )).join("");
  const layouts = selected.layouts.map((layout) => (
    `<option value="${layout.id}">${esc(layout.name)} · ${layout.holes.length} holes${layout.pars_confirmed ? ` · par ${layout.par}` : ""}</option>`
  )).join("");
  const players = state.players.map((player) => (
    `<label class="check"><input type="checkbox" name="player" value="${player.id}" ${player.id === state.playerId ? "checked" : ""}> ${esc(player.name)}</label>`
  )).join("");
  return `${header("start")}
    ${banners()}
    <form class="stack" data-act="start">
      <h1>Start a round</h1>
      <label class="field">Course
        <select name="course_id" id="start-course">${courseOptions}</select>
      </label>
      <label class="field">Layout
        <select name="layout_id">${layouts}</select>
      </label>
      ${selected.layouts[0] && !selected.layouts[0].pars_confirmed ? `<p class="banner warn">This layout's pars are placeholders.</p>` : ""}
      <fieldset class="card stack">
        <legend>Who's playing</legend>
        ${players}
        <label class="field">Add a name
          <input name="guest" maxlength="40" placeholder="Cardmate">
        </label>
      </fieldset>
      <label class="field">Weather
        <select name="weather">${WEATHER.map((item) => `<option value="${esc(item)}">${item || "Skip"}</option>`).join("")}</select>
      </label>
      <label class="field">Note for this round
        <textarea name="notes" maxlength="2000" placeholder="Pins, wind, what you want to remember"></textarea>
      </label>
      <label class="check"><input type="checkbox" name="hide_totals"> Hide the running score</label>
      <button class="primary" type="submit">Start my round</button>
    </form>`;
}

function holeByNumber(round, number) {
  return round.layout.holes.find((hole) => hole.number === number);
}

function scoreFor(round, playerId, hole) {
  return round.scores.find((score) => score.player_id === playerId && score.hole_number === hole) || null;
}

function resultClass(result, vs) {
  if (result === "ace") return "ace";
  return vsClass(vs || 0);
}

function scoreWord(strokes, par) {
  if (strokes === 1) return "Ace";
  const vs = strokes - par;
  if (vs <= -3) return "Albatross";
  if (vs === -2) return "Eagle";
  if (vs === -1) return "Birdie";
  if (vs === 0) return "Par";
  if (vs === 1) return "Bogey";
  if (vs === 2) return "Double";
  return "Triple+";
}

function scoreStepper(player, hole, live) {
  const current = scoreFor(state.round, player.id, hole.number);
  const strokes = current ? current.strokes : null;
  const tone = strokes == null ? "unset" : resultClass(strokes === 1 ? "ace" : "other", strokes - hole.par);
  const shown = strokes == null ? String(hole.par) : String(strokes);
  const locked = live ? "" : "disabled";
  const label = strokes == null ? `No score, par ${hole.par}` : `Score ${strokes}`;
  return `<div class="stepper" role="group" aria-label="Score for ${esc(player.name)}">
    <button type="button" data-act="nudge" data-player="${player.id}" data-delta="-1" aria-label="Lower score" ${locked}>−</button>
    <button type="button" class="stepper-value ${tone}" data-act="nudge" data-player="${player.id}" data-delta="0" aria-label="${esc(label)}" ${locked}>${shown}</button>
    <button type="button" data-act="nudge" data-player="${player.id}" data-delta="1" aria-label="Raise score" ${locked}>+</button>
  </div>`;
}

function renderRound() {
  const round = state.round;
  const live = round.status === "live";
  const holes = round.layout.holes;
  const hole = holeByNumber(round, state.hole) || holes[0];
  const scored = new Set(round.scores.map((score) => score.hole_number));
  const rail = holes.map((item) => (
    `<button type="button" class="${item.number === hole.number ? "on" : ""} ${scored.has(item.number) ? "done" : ""}" data-act="hole" data-hole="${item.number}">${item.number}</button>`
  )).join("");
  const line = round.summary.find((item) => item.player_id === state.playerId) || round.summary[0];
  const running = !round.hide_totals && line && line.holes_scored ? `${line.strokes} (${fmtVs(line.vs_par)})` : "";
  const orderIds = round.tee_order_by_hole[String(hole.number)] || [];
  const order = orderIds.map((id) => {
    const player = round.players.find((item) => item.id === id);
    return player ? player.name : "";
  }).filter(Boolean);
  const players = round.players.map((player) => {
    const current = scoreFor(round, player.id, hole.number);
    const label = current ? `${current.result_label} ${fmtVs(current.vs_par)}` : "—";
    const stats = state.showThrowStats ? `<div class="details">
      <span>Putts</span>
      <button type="button" class="step" data-act="putt" data-player="${player.id}" data-delta="-1" ${live ? "" : "disabled"}>−</button>
      <strong>${current && current.putts != null ? current.putts : "–"}</strong>
      <button type="button" class="step" data-act="putt" data-player="${player.id}" data-delta="1" ${live ? "" : "disabled"}>+</button>
      ${["hit", "left", "right", "parked"].map((fairway) => (
        `<button type="button" class="${current && current.fairway === fairway ? "on" : ""}" data-act="fairway" data-player="${player.id}" data-fairway="${fairway}" ${live ? "" : "disabled"}>${fairway === "hit" ? "Fairway" : fairway[0].toUpperCase() + fairway.slice(1)}</button>`
      )).join("")}
    </div>` : "";
    return `<article class="player-score">
      <div class="player-line">
        <h2>${esc(player.name)}</h2>
        <span class="result ${current ? vsClass(current.vs_par) : ""}">${esc(label)}</span>
      </div>
      ${scoreStepper(player, hole, live)}
      ${live && current ? `<button type="button" class="secondary" data-act="clear-score" data-player="${player.id}">Clear hole</button>` : ""}
      ${stats}
    </article>`;
  }).join("");

  const columnClass = (item) => {
    const parts = [];
    if (item.number === hole.number) parts.push("here");
    if (item.number === 10) parts.push("split");
    return parts.join(" ");
  };
  const holeHeads = holes.map((item) => (
    `<th class="hole-no ${columnClass(item)}" scope="col"><button type="button" data-act="hole" data-hole="${item.number}" aria-label="Hole ${item.number}">${item.number}</button></th>`
  )).join("");
  const parCells = holes.map((item) => `<td class="${columnClass(item)}">${item.par}</td>`).join("");
  const parTotal = holes.reduce((sum, item) => sum + Number(item.par || 0), 0);
  const cardRows = round.players.map((player) => {
    const cells = holes.map((item) => {
      const score = scoreFor(round, player.id, item.number);
      const text = score && score.strokes != null ? String(score.strokes) : String(item.par);
      const tone = score ? vsClass(score.vs_par) : "empty";
      const spoken = score && score.strokes != null
        ? `Hole ${item.number}, ${score.strokes}`
        : `Hole ${item.number}, par ${item.par}, no score yet`;
      return `<td class="${columnClass(item)}"><button type="button" class="${tone}" data-act="hole" data-hole="${item.number}" aria-label="${spoken}">${text}</button></td>`;
    }).join("");
    const summary = round.summary.find((item) => item.player_id === player.id);
    const showTotal = !round.hide_totals && summary && summary.holes_scored;
    const total = showTotal ? `<b>${summary.strokes}</b> <span class="muted">${esc(fmtVs(summary.vs_par))}</span>` : "–";
    return `<tr><th class="name" scope="row">${esc(player.name)}</th>${cells}<td class="tot">${total}</td></tr>`;
  }).join("");

  return `${header("round")}
    ${banners()}
    <section class="stack">
      <div class="player-line">
        <div>
          <h1>${esc(round.course.name)}</h1>
          <p class="muted">${esc(round.layout.name)}${round.weather ? ` · ${esc(round.weather)}` : ""}</p>
        </div>
        <button type="button" class="secondary" data-act="sheet" data-sheet="round">Menu</button>
      </div>
      ${live ? "" : `<p class="banner good"><span>This round is finished.</span> <button type="button" class="secondary" data-act="reopen">Reopen</button></p>`}
      ${round.layout.pars_confirmed ? "" : `<p class="banner warn">Pars on this layout are placeholders, so the score versus par will be off.</p>`}
      ${!round.hide_totals && running ? `<p><strong>You</strong> · ${esc(running)} · ${line.holes_scored} scored</p>` : ""}
      <div class="seg">
        <button type="button" class="${state.mode === "hole" ? "on" : ""}" data-act="mode" data-mode="hole">Hole</button>
        <button type="button" class="${state.mode === "card" ? "on" : ""}" data-act="mode" data-mode="card">Card</button>
      </div>
      ${state.mode === "card" ? "" : `<div class="rail">${rail}</div>`}
      ${state.mode === "card" ? `<div class="card cardgrid"><table>
        <thead>
          <tr><th class="name" scope="row">Hole</th>${holeHeads}<th class="tot" scope="col">Tot</th></tr>
          <tr><th class="name" scope="row">Par</th>${parCells}<td class="tot">${parTotal}</td></tr>
        </thead>
        <tbody>${cardRows}</tbody>
      </table></div>` : `<div class="stack">
        <h2>Hole ${hole.number} <span class="muted">par ${hole.par}${hole.distance_ft ? ` · ${esc(fmtFeet(hole.distance_ft))}` : ""}</span></h2>
        ${hole.notes ? `<p>${esc(hole.notes)}</p>` : ""}
        ${order.length > 1 ? `<p class="muted">Tee order: ${esc(order.join(", "))}</p>` : ""}
        ${players}
      </div>`}
      <div class="pager">
        <button type="button" class="secondary" data-act="hole" data-hole="${Math.max(1, hole.number - 1)}">Previous</button>
        <button type="button" class="secondary" data-act="hole" data-hole="${Math.min(holes.length, hole.number + 1)}">Next</button>
      </div>
      ${live ? `<button type="button" class="primary" data-act="ask-finish">Finish round</button>` : ""}
    </section>`;
}

function renderRounds() {
  const person = me();
  const all = state.playerRounds || [];
  const ordered = all.filter((round) => round.status === "live").concat(all.filter((round) => round.status !== "live"));
  const rows = ordered.map((round) => {
    const line = (round.summary || []).find((item) => item.player_id === state.playerId) || (round.summary || [])[0];
    const total = line && line.holes_scored ? `${line.strokes} (${fmtVs(line.vs_par)})` : "No score";
    const when = fmtWhen(round.started_at);
    const title = round.status === "live" ? `Live · ${round.course.name}` : round.course.name;
    return roundSwipe(round.id, title, `${when} · ${round.layout.name} · ${total}`, round.course.name);
  }).join("");
  return `${header("rounds")}
    ${banners()}
    <section class="stack">
      <h1>Rounds</h1>
      <p class="muted">${person ? esc(person.name) : "Player"} · open a round to change the card. Swipe left to remove one.</p>
      ${rows || `<p class="empty">No rounds yet.</p>`}
    </section>`;
}

function renderPlay() {
  const live = state.live.map((round) => roundSwipe(
    round.id,
    round.course.name,
    `Live · ${round.layout.name}`,
    round.course.name,
  )).join("");
  return `${header()}
    ${banners()}
    <section class="stack">
      <h1>Play</h1>
      <button type="button" class="primary" data-go="start">Start a round</button>
      ${live || `<p class="empty">No live round. Start one and the card stays here until you finish it.</p>`}
    </section>`;
}

function renderStats() {
  const stats = state.stats;
  if (!stats) return `${header()}<p class="empty">Loading…</p>`;
  const results = stats.results;
  const totalHoles = Object.values(results).reduce((sum, count) => sum + count, 0);
  const segments = [
    ["ace", "Aces"],
    ["albatross", "Albatross"],
    ["eagle", "Eagles"],
    ["birdie", "Birdies"],
    ["par", "Pars"],
    ["bogey", "Bogeys"],
    ["double", "Doubles"],
    ["worse", "Worse"],
  ].filter(([key]) => results[key]);
  const bar = totalHoles ? `<div class="bar">${segments.map(([key]) => `<span class="${key}" style="flex:${results[key]}"></span>`).join("")}</div>
    <div class="legend">${segments.map(([key, label]) => `<span>${label} ${results[key]}</span>`).join("")}</div>` : "";
  const courses = stats.courses.map((course) => (
    `<button type="button" class="rowcard" data-go="courses/${course.course_id}">
      <span class="rowcard-title">${esc(course.name)}</span>
      <span class="muted">${course.rounds} round${course.rounds === 1 ? "" : "s"}${course.average_vs_par != null ? ` · avg ${fmtVs(course.average_vs_par)}` : ""}${course.best_vs_par != null ? ` · best ${fmtVs(course.best_vs_par)}` : ""}</span>
    </button>`
  )).join("");
  const recent = stats.recent.map((round) => roundSwipe(
    round.round_id,
    round.course_name,
    `${fmtWhen(round.started_at)}${round.holes_scored ? ` · ${round.strokes} (${fmtVs(round.vs_par)})` : ""}`,
    round.course_name,
  )).join("");
  const aces = stats.aces.map((ace) => (
    `<button type="button" class="rowcard" data-go="play/${ace.round_id}">
      <span class="rowcard-title">Ace · hole ${ace.hole_number}</span>
      <span class="muted">${esc(ace.course_name)} · par ${ace.par}</span>
    </button>`
  )).join("");
  const best = stats.best_round;
  return `${header()}
    ${banners()}
    <section class="stack">
      <h1>${esc(stats.player.name)}</h1>
      <div class="stats">
        <article class="card stat"><b class="${stats.average_vs_par < 0 ? "under" : ""}">${stats.average_vs_par == null ? "—" : fmtVs(stats.average_vs_par)}</b><span class="muted">Avg vs par</span></article>
        <button type="button" class="card stat" data-go="rounds"><b>${stats.rounds_finished}</b><span class="muted">Rounds</span></button>
        <article class="card stat"><b>${stats.courses_played}</b><span class="muted">Courses</span></article>
        <article class="card stat"><b>${results.ace}</b><span class="muted">Aces</span></article>
      </div>
      ${best ? `<button type="button" class="rowcard" data-go="play/${best.round_id}"><span class="rowcard-title">Best ${fmtVs(best.vs_par)} · ${best.strokes} strokes</span><span class="muted">${esc(best.course_name)} · ${esc(fmtWhen(best.played_at))}</span></button>` : `<p class="empty">Finish a scored round and your best, your birdies, and your aces land here.</p>`}
      ${bar}
      ${stats.fairway_pct != null ? `<p class="muted">Fairway ${stats.fairway_pct}% · parked ${stats.parked}${stats.putts_per_hole != null ? ` · ${stats.putts_per_hole} putts per hole` : ""}</p>` : ""}
      ${aces ? `<h2>Aces</h2>${aces}` : ""}
      ${courses ? `<h2>By course</h2>${courses}` : ""}
      ${roundsHeading()}
      ${recent || `<p class="empty">No finished rounds yet.</p>`}
    </section>`;
}

function flight(disc) {
  const parts = [disc.speed, disc.glide, disc.turn, disc.fade].map((part) => (part == null ? "–" : part));
  if (parts.every((part) => part === "–")) return "";
  return parts.join(" / ");
}

function renderBag() {
  const groups = [
    ["In the bag", (disc) => disc.in_bag && !disc.lost],
    ["On the shelf", (disc) => !disc.in_bag && !disc.lost],
    ["Lost", (disc) => disc.lost],
  ];
  const sections = groups.map(([label, test]) => {
    const rows = state.discs.filter(test).map((disc) => (
      `<button type="button" class="rowcard ${disc.lost ? "lost" : ""}" data-go="disc/${disc.id}">
        <span class="rowcard-title">${esc(disc.mold)}</span>
        <span class="muted">${esc([disc.manufacturer, disc.plastic, disc.disc_type, disc.color].filter(Boolean).join(" · "))}</span>
        ${flight(disc) ? `<span class="flight">${esc(flight(disc))}</span>` : ""}
      </button>`
    )).join("");
    return rows ? `<h2>${label}</h2>${rows}` : "";
  }).join("");
  return `${header()}
    ${banners()}
    <section class="stack">
      <h1>Bag</h1>
      <button type="button" class="primary" data-go="disc">Add a disc</button>
      ${sections || `<p class="empty">Add the discs you throw. Speed, glide, turn, and fade are optional.</p>`}
    </section>`;
}

function renderDisc() {
  const disc = state.discs.find((item) => item.id === state.discId) || null;
  const value = (field, fallback = "") => esc(disc && disc[field] != null ? disc[field] : fallback);
  const type = disc ? disc.disc_type : "midrange";
  return `${header("disc")}
    ${banners()}
    <form class="stack" data-act="disc">
      <h1>${disc ? "Edit disc" : "Add a disc"}</h1>
      <label class="field">Mold <input name="mold" required maxlength="60" value="${value("mold")}"></label>
      <div class="inline">
        <label class="field">Maker <input name="manufacturer" value="${value("manufacturer")}"></label>
        <label class="field">Plastic <input name="plastic" value="${value("plastic")}"></label>
      </div>
      <label class="field">Type
        <select name="disc_type">
          ${["putter", "midrange", "fairway", "distance"].map((item) => `<option value="${item}" ${item === type ? "selected" : ""}>${item}</option>`).join("")}
        </select>
      </label>
      <div class="inline">
        <label class="field">Speed <input name="speed" inputmode="numeric" value="${value("speed")}"></label>
        <label class="field">Glide <input name="glide" inputmode="numeric" value="${value("glide")}"></label>
        <label class="field">Turn <input name="turn" inputmode="decimal" value="${value("turn")}"></label>
        <label class="field">Fade <input name="fade" inputmode="decimal" value="${value("fade")}"></label>
      </div>
      <div class="inline">
        <label class="field">Weight (g) <input name="weight" inputmode="numeric" value="${value("weight")}"></label>
        <label class="field">Color <input name="color" value="${value("color")}"></label>
      </div>
      <label class="check"><input type="checkbox" name="in_bag" ${!disc || disc.in_bag ? "checked" : ""}> In the bag</label>
      <label class="check"><input type="checkbox" name="lost" ${disc && disc.lost ? "checked" : ""}> Lost</label>
      <label class="field">Notes <textarea name="notes">${value("notes")}</textarea></label>
      <button class="primary" type="submit">Save disc</button>
      ${disc ? `<button type="button" class="danger" data-act="ask-delete-disc" data-id="${disc.id}" data-name="${esc(disc.mold)}">Delete disc</button>` : ""}
    </form>`;
}

function renderSheet() {
  if (!state.sheet) return "";
  if (state.sheet === "players") {
    const picks = state.players.map((player) => (
      `<button type="button" class="secondary" data-act="pick-player" data-id="${player.id}">${esc(player.name)}${player.id === state.playerId ? " · you" : ""}</button>`
    )).join("");
    return `<div class="sheet-back">
      <div class="sheet stack" role="dialog" aria-label="Players">
        <h2>Players</h2>
        ${picks}
        <form class="stack" data-act="add-player">
          <input name="name" maxlength="40" placeholder="New player" required>
          <button class="primary" type="submit">Add player</button>
        </form>
        <form class="stack" data-act="rename">
          <input name="name" maxlength="40" value="${esc(me() ? me().name : "")}" required>
          <button class="secondary" type="submit">Rename me</button>
        </form>
        <button type="button" class="danger" data-act="ask-delete-player" data-id="${state.playerId}" data-name="${esc(me() ? me().name : "")}">Remove me</button>
        <a class="linkish" href="/admin">Admin</a>
        <button type="button" class="secondary" data-act="sheet">Close</button>
      </div>
    </div>`;
  }
  if (state.sheet === "round" && state.round) {
    const round = state.round;
    const others = state.players.filter((player) => !round.players.some((seat) => seat.id === player.id));
    const seats = round.players.map((player, index) => (
      `<div class="inline">
        <span>${esc(player.name)}</span>
        <button type="button" data-act="move-player" data-player="${player.id}" data-dir="-1" ${index === 0 ? "disabled" : ""}>Up</button>
        <button type="button" data-act="move-player" data-player="${player.id}" data-dir="1" ${index === round.players.length - 1 ? "disabled" : ""}>Down</button>
        <button type="button" data-act="ask-remove-card" data-player="${player.id}" data-name="${esc(player.name)}">Remove</button>
      </div>`
    )).join("");
    return `<div class="sheet-back">
      <div class="sheet stack" role="dialog" aria-label="Round menu">
        <h2>Round</h2>
        <form class="stack" data-act="round-meta">
          <label class="field">Weather
            <select name="weather">${WEATHER.map((item) => `<option value="${esc(item)}" ${item === round.weather ? "selected" : ""}>${item || "Skip"}</option>`).join("")}</select>
          </label>
          <label class="field">Note
            <textarea name="notes" maxlength="2000">${esc(round.notes)}</textarea>
          </label>
          <label class="check"><input id="hide-totals" name="hide_totals" type="checkbox" ${round.hide_totals ? "checked" : ""}> Hide the running score</label>
          <button class="primary" type="submit">Save</button>
        </form>
        ${round.status === "live" ? `<div class="stack"><h2>Card order</h2>${seats}
          <form class="stack" data-act="add-card-player">
            <select name="player_id">
              <option value="">Add someone</option>
              ${others.map((player) => `<option value="${player.id}">${esc(player.name)}</option>`).join("")}
            </select>
            <input name="guest" maxlength="40" placeholder="Or a new name">
            <button class="secondary" type="submit">Add to card</button>
          </form>
        </div>` : ""}
        <button type="button" class="secondary" data-act="copy">Copy scorecard</button>
        <button type="button" class="secondary" data-act="toggle-stats">${state.showThrowStats ? "Hide throw stats" : "Show putts and fairway"}</button>
        ${round.status === "live" ? `<button type="button" class="primary" data-act="ask-finish">Finish round</button>` : `<button type="button" class="primary" data-act="reopen">Reopen round</button>`}
        <button type="button" class="danger" data-act="ask-delete-round" data-id="${round.id}" data-name="${esc(round.course.name)}">Delete round</button>
        <button type="button" class="secondary" data-act="sheet">Close</button>
      </div>
    </div>`;
  }
  return "";
}

function isAdmin() {
  return location.pathname === "/admin" || location.pathname === "/admin/";
}

function render() {
  const app = document.getElementById("app");
  const nav = document.getElementById("nav");
  document.body.classList.toggle("busy", state.busy);
  if (isAdmin()) {
    nav.hidden = true;
    app.innerHTML = renderAdmin() + renderConfirm();
    return;
  }
  if (!state.playerId) {
    nav.hidden = true;
    app.innerHTML = banners() + renderWelcome();
    return;
  }
  nav.hidden = false;
  nav.querySelectorAll("[data-tab]").forEach((button) => {
    const on = button.dataset.tab === state.tab;
    button.classList.toggle("on", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  const screens = {
    home: renderHome,
    courses: renderCourses,
    course: renderCourse,
    form: renderCourseForm,
    layout: renderLayout,
    discover: renderDiscover,
    start: renderStart,
    round: renderRound,
    rounds: renderRounds,
    play: renderPlay,
    stats: renderStats,
    bag: renderBag,
    disc: renderDisc,
  };
  const draw = screens[state.screen] || renderHome;
  app.innerHTML = draw() + renderSheet() + renderConfirm();
  revealCurrentHole();
}

function revealCurrentHole() {
  const rail = document.querySelector("#app .rail");
  if (rail) {
    const current = rail.querySelector("button.on");
    if (current) {
      const target = current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2;
      rail.scrollLeft = Math.max(0, target);
    }
  }
  const card = document.querySelector("#app .cardgrid");
  const column = card && card.querySelector("thead .here");
  if (!card || !column) return;
  const name = card.querySelector(".name");
  const nameWidth = name ? name.getBoundingClientRect().width : 0;
  const scrollerBox = card.getBoundingClientRect();
  const cellBox = column.getBoundingClientRect();
  const viewLeft = scrollerBox.left + nameWidth;
  const viewWidth = card.clientWidth - nameWidth;
  const delta = cellBox.left - viewLeft - (viewWidth - cellBox.width) / 2;
  card.scrollLeft = Math.max(0, card.scrollLeft + delta);
}

function renderConfirm() {
  const ask = state.confirm;
  if (!ask) return "";
  return `<div class="sheet-back">
    <div class="sheet stack confirm" role="alertdialog" aria-labelledby="confirm-title">
      <h2 id="confirm-title">${esc(ask.title)}</h2>
      <p>${esc(ask.body)}</p>
      <button type="button" class="${ask.tone || "danger"}" data-act="confirm-yes">${esc(ask.yes)}</button>
      <button type="button" class="secondary" data-act="confirm-no">${esc(ask.no || "Keep it")}</button>
    </div>
  </div>`;
}

function askRemove(title, body, yes, act, data, no = "Keep it", tone = "danger") {
  state.confirm = { title, body, yes, no, act, data, tone };
  state.sheet = null;
  paint();
}

function renderAdmin() {
  const info = state.admin;
  const players = info ? info.players.map((player) => (
    `<div class="card stack">
      <strong>${esc(player.name)}</strong>
      <span class="muted">${player.rounds} round${player.rounds === 1 ? "" : "s"} · ${player.scores} scores · ${player.discs} disc${player.discs === 1 ? "" : "s"}</span>
      <button type="button" class="danger" data-act="ask-delete-admin-player" data-id="${player.id}" data-name="${esc(player.name)}">Remove ${esc(player.name)}</button>
    </div>`
  )).join("") : "";
  const counts = info ? `${info.players.length} players · ${info.courses} courses · ${info.rounds} rounds (${info.live_rounds} live) · ${info.discs} discs` : "";
  return `${banners()}
    <section class="stack">
      <h1>Admin</h1>
      <p class="lede">Everything lives in one database. Export it before you replace it. Anyone on your Wi-Fi who opens this page can do that.</p>
      <p class="muted">${esc(counts)}</p>
      <button type="button" class="primary" data-act="export-backup">Export full backup</button>
      <form class="card stack" data-act="import-backup">
        <h2>Import</h2>
        <p>This replaces every player, course, round, and disc with the file. Type REPLACE to confirm.</p>
        <label class="field">Backup file
          <input id="import-file" name="file" type="file" accept="application/json,.json" required>
        </label>
        <label class="field">Confirmation
          <input id="import-word" name="word" autocomplete="off" placeholder="REPLACE">
        </label>
        <button id="import-go" class="danger" type="submit" disabled>Replace all data</button>
      </form>
      <h2>Players</h2>
      <p class="muted">Removing a player deletes their discs, notes, and scores. A round stays if someone else is still on the card.</p>
      ${players || `<p class="empty">No players yet.</p>`}
      <a class="linkish" href="/">Back to the scorekeeper</a>
    </section>`;
}

function coursePayload(data) {
  const numberOrNull = (name) => {
    const raw = String(data.get(name) || "").trim();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const payload = {
    name: String(data.get("name") || ""),
    city: String(data.get("city") || ""),
    region: String(data.get("region") || ""),
    country: (state.course && state.course.country) || "United States",
    address: String(data.get("address") || ""),
    latitude: numberOrNull("latitude"),
    longitude: numberOrNull("longitude"),
    description: String(data.get("description") || ""),
    website: String(data.get("website") || ""),
    tee_type: String(data.get("tee_type") || ""),
    target_type: String(data.get("target_type") || ""),
    foliage: String(data.get("foliage") || ""),
    hole_count: Number(data.get("hole_count") || 18),
  };
  FLAGS.forEach(([key]) => {
    payload[key] = String(data.get(key) || "unknown");
  });
  return payload;
}

function optionalNumber(data, name) {
  const raw = String(data.get(name) || "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rememberScore(playerId, strokes, holeNumber = state.hole) {
  const round = state.round;
  if (!round) return;
  const hole = holeByNumber(round, holeNumber);
  const par = hole ? hole.par : 3;
  const previous = scoreFor(round, playerId, holeNumber);
  const keep = round.scores.filter((score) => !(score.player_id === playerId && score.hole_number === holeNumber));
  if (strokes != null) {
    keep.push({
      player_id: playerId,
      hole_number: holeNumber,
      strokes,
      putts: previous ? previous.putts : null,
      fairway: previous ? previous.fairway : null,
      vs_par: strokes - par,
      result_label: scoreWord(strokes, par),
    });
  }
  round.scores = keep;
  const line = round.summary.find((item) => item.player_id === playerId);
  if (line) {
    const mine = keep.filter((score) => score.player_id === playerId);
    line.strokes = mine.reduce((sum, score) => sum + score.strokes, 0);
    line.par = mine.reduce((sum, score) => sum + (holeByNumber(round, score.hole_number) || { par: 3 }).par, 0);
    line.vs_par = line.strokes - line.par;
    line.holes_scored = mine.length;
  }
}

const scoreQueue = new Map();
let scoreFlush = null;
let roundEpoch = 0;

function queueScore(roundId, playerId, hole, strokes) {
  scoreQueue.set(`${roundId}:${playerId}:${hole}`, { roundId, playerId, hole, strokes });
  if (!scoreFlush) scoreFlush = flushScores().finally(() => { scoreFlush = null; });
}

async function flushScores() {
  try {
    while (scoreQueue.size) {
      const batch = [...scoreQueue.values()];
      scoreQueue.clear();
      for (const item of batch) {
        if (!state.round || state.round.id !== item.roundId) continue;
        const local = scoreFor(state.round, item.playerId, item.hole);
        const epoch = roundEpoch;
        const saved = await api(`/api/rounds/${item.roundId}/scores`, {
          method: "PUT",
          body: {
            player_id: item.playerId,
            hole_number: item.hole,
            strokes: item.strokes,
            putts: local ? local.putts : null,
            fairway: local ? local.fairway : null,
          },
        });
        if (!state.round || state.round.id !== item.roundId) continue;
        if (epoch !== roundEpoch) {
          if (state.round.players.some((player) => player.id === item.playerId)) {
            rememberScore(item.playerId, item.strokes, item.hole);
          }
          continue;
        }
        state.round = saved;
        scoreQueue.forEach((pending) => {
          if (pending.roundId === state.round.id) rememberScore(pending.playerId, pending.strokes, pending.hole);
        });
      }
    }
  } catch (err) {
    scoreQueue.clear();
    state.error = err.message || "That didn't go through. Try again.";
    if (state.round) {
      try {
        state.round = await api(`/api/rounds/${state.round.id}`);
      } catch (reloadErr) {
        /* keep the score already on screen */
      }
    }
  }
  render();
}

async function settleScores() {
  while (scoreQueue.size || scoreFlush) {
    if (!scoreFlush && scoreQueue.size) {
      scoreFlush = flushScores().finally(() => { scoreFlush = null; });
    }
    if (!scoreFlush) break;
    await scoreFlush;
  }
}

async function saveScore(playerId, strokes, extras = {}) {
  await settleScores();
  const round = state.round;
  const current = scoreFor(round, playerId, state.hole);
  const epoch = roundEpoch;
  const saved = await api(`/api/rounds/${round.id}/scores`, {
    method: "PUT",
    body: {
      player_id: playerId,
      hole_number: state.hole,
      strokes,
      putts: extras.putts !== undefined ? extras.putts : (current ? current.putts : null),
      fairway: extras.fairway !== undefined ? extras.fairway : (current ? current.fairway : null),
    },
  });
  if (!state.round || state.round.id !== round.id) return;
  if (epoch !== roundEpoch) {
    if (state.round.players.some((player) => player.id === playerId)) rememberScore(playerId, strokes);
    return;
  }
  state.round = saved;
  const holeCount = state.round.layout.holes.length;
  const everyone = state.round.players.every((player) => scoreFor(state.round, player.id, state.hole));
  if (extras.advance && strokes != null && everyone && state.hole < holeCount) {
    state.hole += 1;
    sessionStorage.setItem("dolfHole", String(state.hole));
  }
}

function scorecardText(round) {
  const lines = [`${round.course.name} — ${round.layout.name}`];
  round.summary.forEach((line) => {
    if (!line.holes_scored) lines.push(`${line.name}  no score`);
    else lines.push(`${line.name}  ${line.strokes} (${fmtVs(line.vs_par)})`);
  });
  if (round.notes) lines.push(round.notes);
  return lines.join("\n");
}

async function importBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    throw new Error("That file isn't JSON.");
  }
  const result = await api("/api/admin/import", { method: "POST", body: payload });
  state.admin = await api("/api/admin/summary");
  state.notice = `Restored ${result.players} players, ${result.courses} courses, and ${result.rounds} rounds.`;
}

async function onSubmit(act, data) {
  if (act === "welcome" || act === "add-player") {
    const created = await api("/api/players", { method: "POST", body: { name: String(data.get("name") || "") } });
    state.players = await api("/api/players");
    if (act === "welcome" || !state.playerId) setPlayer(created.id);
    state.sheet = null;
    if (act === "welcome") await applyHash();
    return;
  }
  if (act === "rename") {
    const updated = await api(`/api/players/${state.playerId}`, { method: "PATCH", body: { name: String(data.get("name") || "") } });
    state.players = await api("/api/players");
    setPlayer(updated.id);
    state.sheet = null;
    return;
  }
  if (act === "start") {
    const courseId = Number(data.get("course_id"));
    const layoutId = Number(data.get("layout_id"));
    const ids = data.getAll("player").map(Number).filter(Boolean);
    const guest = String(data.get("guest") || "").trim();
    if (guest) {
      const created = await api("/api/players", { method: "POST", body: { name: guest } });
      state.players = await api("/api/players");
      ids.push(created.id);
    }
    if (!ids.length) throw new Error("Add at least one player.");
    const round = await api("/api/rounds", {
      method: "POST",
      body: {
        course_id: courseId,
        layout_id: layoutId,
        player_ids: ids,
        notes: String(data.get("notes") || ""),
        weather: String(data.get("weather") || ""),
        hide_totals: data.get("hide_totals") === "on",
      },
    });
    state.hole = 1;
    sessionStorage.setItem("dolfHole", "1");
    await navigate(`play/${round.id}`, true);
    return;
  }
  if (act === "course") {
    const payload = coursePayload(data);
    const course = state.course
      ? await api(`/api/courses/${state.course.id}`, { method: "PATCH", body: payload })
      : await api("/api/courses", { method: "POST", body: payload });
    await navigate(`courses/${course.id}`, true);
    return;
  }
  if (act === "layout") {
    const body = {
      name: state.draft.name,
      notes: state.draft.notes,
      holes: state.draft.holes.map((hole) => ({
        par: Number(hole.par),
        distance_ft: hole.distance_ft === "" || hole.distance_ft == null ? null : Number(hole.distance_ft),
        notes: hole.notes || "",
      })),
    };
    const course = state.layoutId
      ? await api(`/api/layouts/${state.layoutId}`, { method: "PUT", body })
      : await api(`/api/courses/${state.course.id}/layouts`, { method: "POST", body });
    state.draft = null;
    await navigate(`courses/${course.id}`, true);
    return;
  }
  if (act === "review") {
    state.course = await api(`/api/courses/${state.course.id}/reviews`, {
      method: "POST",
      body: {
        player_id: state.playerId,
        rating: Number(data.get("rating")),
        conditions: String(data.get("conditions") || "good"),
        body: String(data.get("body") || ""),
      },
    });
    return;
  }
  if (act === "discover") {
    state.discoverQuery = String(data.get("q") || "");
    state.notice = "Searching public maps…";
    render();
    state.discover = await api(`/api/courses/discover?q=${encodeURIComponent(state.discoverQuery)}`);
    state.notice = state.discover.length ? "" : "No courses found. Try a city, or add one yourself.";
    return;
  }
  if (act === "disc") {
    const payload = {
      player_id: state.playerId,
      mold: String(data.get("mold") || ""),
      manufacturer: String(data.get("manufacturer") || ""),
      plastic: String(data.get("plastic") || ""),
      disc_type: String(data.get("disc_type") || "midrange"),
      speed: optionalNumber(data, "speed"),
      glide: optionalNumber(data, "glide"),
      turn: optionalNumber(data, "turn"),
      fade: optionalNumber(data, "fade"),
      weight: optionalNumber(data, "weight"),
      color: String(data.get("color") || ""),
      in_bag: data.get("in_bag") === "on",
      lost: data.get("lost") === "on",
      notes: String(data.get("notes") || ""),
    };
    if (state.discId) {
      await api(`/api/discs/${state.discId}`, { method: "PATCH", body: payload });
    } else {
      await api("/api/discs", { method: "POST", body: payload });
    }
    await navigate("bag", true);
    return;
  }
  if (act === "round-meta") {
    state.round = await api(`/api/rounds/${state.round.id}`, {
      method: "PATCH",
      body: {
        weather: String(data.get("weather") || ""),
        notes: String(data.get("notes") || ""),
        hide_totals: data.get("hide_totals") === "on",
      },
    });
    state.sheet = null;
    return;
  }
  if (act === "add-card-player") {
    let playerId = Number(data.get("player_id") || 0);
    const guest = String(data.get("guest") || "").trim();
    if (guest) {
      const created = await api("/api/players", { method: "POST", body: { name: guest } });
      state.players = await api("/api/players");
      playerId = created.id;
    }
    if (!playerId) throw new Error("Choose a player or type a name.");
    roundEpoch += 1;
    state.round = await api(`/api/rounds/${state.round.id}/players`, { method: "POST", body: { player_id: playerId } });
    roundEpoch += 1;
    state.players = await api("/api/players");
    return;
  }
}

async function doAct(act, data) {
  if (act === "score") {
    await saveScore(Number(data.player), Number(data.strokes), { advance: data.fresh === "1" });
    return;
  }
  if (act === "clear-score") {
    await saveScore(Number(data.player), null);
    return;
  }
  if (act === "putt") {
    const current = scoreFor(state.round, Number(data.player), state.hole);
    if (!current) throw new Error("Enter a score before putts.");
    const putts = Math.max(0, Math.min(12, (current.putts || 0) + Number(data.delta)));
    await saveScore(Number(data.player), current.strokes, { putts });
    return;
  }
  if (act === "fairway") {
    const current = scoreFor(state.round, Number(data.player), state.hole);
    if (!current) throw new Error("Enter a score before the fairway.");
    const fairway = current.fairway === data.fairway ? null : data.fairway;
    await saveScore(Number(data.player), current.strokes, { fairway });
    return;
  }
  if (act === "finish-round") {
    await settleScores();
    state.round = await api(`/api/rounds/${state.round.id}/finish`, { method: "POST" });
    state.sheet = null;
    state.notice = "Round finished.";
    return;
  }
  if (act === "reopen") {
    state.round = await api(`/api/rounds/${state.round.id}/reopen`, { method: "POST" });
    return;
  }
  if (act === "delete-round") {
    const id = Number(data.id || (state.round && state.round.id));
    await api(`/api/rounds/${id}`, { method: "DELETE" });
    if (state.round && state.round.id === id) sessionStorage.removeItem("dolfRound");
    state.notice = "Round removed.";
    if (state.screen === "round" && state.round && state.round.id === id) await navigate(state.tab || "home", true);
    else await applyHash();
    return;
  }
  if (act === "delete-course") {
    await api(`/api/courses/${data.id}`, { method: "DELETE" });
    state.notice = "Course removed.";
    await navigate("courses", true);
    return;
  }
  if (act === "delete-layout") {
    await api(`/api/layouts/${data.id}`, { method: "DELETE" });
    state.notice = "Layout removed.";
    await navigate(`courses/${data.course}`, true);
    return;
  }
  if (act === "delete-review") {
    await api(`/api/reviews/${data.id}`, { method: "DELETE" });
    state.notice = "Note removed.";
    await applyHash();
    return;
  }
  if (act === "delete-disc") {
    await api(`/api/discs/${data.id}`, { method: "DELETE" });
    state.notice = "Disc removed.";
    await navigate("bag", true);
    return;
  }
  if (act === "delete-player") {
    const id = Number(data.id);
    const wasCurrent = id === state.playerId;
    state.players = state.players.filter((player) => player.id !== id);
    if (wasCurrent) {
      localStorage.removeItem("dolfPlayerId");
      state.playerId = null;
      state.sheet = null;
    }
    paint();
    try {
      await api(`/api/players/${id}`, { method: "DELETE" });
    } catch (err) {
      state.players = await api("/api/players");
      if (wasCurrent) {
        state.playerId = id;
        localStorage.setItem("dolfPlayerId", String(id));
      }
      throw err;
    }
    state.players = await api("/api/players");
    state.notice = "Player removed.";
    return;
  }
  if (act === "delete-admin-player") {
    const id = Number(data.id);
    if (state.admin) state.admin.players = state.admin.players.filter((player) => player.id !== id);
    paint();
    try {
      await api(`/api/admin/players/${id}`, { method: "DELETE" });
    } catch (err) {
      state.admin = await api("/api/admin/summary");
      throw err;
    }
    state.admin = await api("/api/admin/summary");
    state.players = await api("/api/players");
    if (state.playerId === id) {
      localStorage.removeItem("dolfPlayerId");
      state.playerId = null;
    }
    state.notice = "Player removed.";
    return;
  }
  if (act === "export-backup") {
    const payload = await api("/api/admin/export");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dolf-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    state.notice = "Backup downloaded.";
    return;
  }
  if (act === "copy") {
    const text = scorecardText(state.round);
    try {
      await navigator.clipboard.writeText(text);
      state.notice = "Scorecard copied.";
    } catch (err) {
      state.notice = text;
    }
    return;
  }
  if (act === "import") {
    const item = state.discover[Number(data.index)];
    const course = await api("/api/courses/import", { method: "POST", body: item });
    await navigate(`courses/${course.id}`);
    return;
  }
  if (act === "filter") {
    state.filters[data.filter] = !state.filters[data.filter];
    await applyHash();
    return;
  }
  if (act === "move-player") {
    const ids = state.round.players.map((player) => player.id);
    const index = ids.indexOf(Number(data.player));
    const swap = index + Number(data.dir);
    if (index < 0 || swap < 0 || swap >= ids.length) return;
    const next = ids.slice();
    [next[index], next[swap]] = [next[swap], next[index]];
    roundEpoch += 1;
    state.round = await api(`/api/rounds/${state.round.id}/order`, { method: "PUT", body: { player_ids: next } });
    roundEpoch += 1;
    return;
  }
  if (act === "remove-card") {
    const id = Number(data.player);
    roundEpoch += 1;
    for (const key of [...scoreQueue.keys()]) {
      if (key.startsWith(`${state.round.id}:${id}:`)) scoreQueue.delete(key);
    }
    state.round.players = state.round.players.filter((player) => player.id !== id);
    state.round.scores = state.round.scores.filter((score) => score.player_id !== id);
    state.round.summary = state.round.summary.filter((line) => line.player_id !== id);
    paint();
    state.round = await api(`/api/rounds/${state.round.id}/players/${id}`, { method: "DELETE" });
    roundEpoch += 1;
    state.sheet = "round";
    state.notice = "Player removed from the card.";
    return;
  }
}

function onAct(el) {
  const act = el.dataset.act;
  const data = { ...el.dataset };
  if (act === "sheet") {
    state.sheet = data.sheet || null;
    if (state.sheet === "players" || state.sheet === "round") {
      run(async () => {
        state.players = await api("/api/players");
      });
    } else paint();
    return;
  }
  if (act === "pick-player") {
    setPlayer(Number(data.id));
    state.sheet = null;
    run(() => applyHash());
    return;
  }
  if (act === "hole") {
    const maxHole = state.round ? state.round.layout.holes.length : 1;
    state.hole = Math.min(Math.max(Number(data.hole) || 1, 1), maxHole);
    state.mode = "hole";
    sessionStorage.setItem("dolfHole", String(state.hole));
    paint();
    return;
  }
  if (act === "mode") {
    state.mode = data.mode === "card" ? "card" : "hole";
    paint();
    return;
  }
  if (act === "toggle-stats") {
    state.showThrowStats = !state.showThrowStats;
    localStorage.setItem("dolfThrowStats", state.showThrowStats ? "1" : "0");
    paint();
    return;
  }
  if (act === "add-hole" && state.draft) {
    state.draft.holes.push({ par: 3, distance_ft: null, notes: "" });
    paint();
    return;
  }
  if (act === "remove-hole" && state.draft && state.draft.holes.length > 1) {
    state.draft.holes.pop();
    paint();
    return;
  }
  if (act === "back") {
    if (history.length > 1) history.back();
    else run(() => navigate(state.tab || "home", true));
    return;
  }
  if (act === "confirm-no") {
    state.confirm = null;
    paint();
    return;
  }
  if (act === "confirm-yes") {
    const ask = state.confirm;
    state.confirm = null;
    if (!ask) return;
    const job = () => doAct(ask.act, ask.data || {});
    if (state.busy) {
      state.nextWork = job;
      paint();
    } else {
      run(job);
    }
    return;
  }
  if (act === "ask-finish") {
    askRemove(
      "Finish this round?",
      "Are you sure you want to finish this round? You can reopen it later.",
      "Finish round",
      "finish-round",
      {},
      "Keep scoring",
      "primary",
    );
    return;
  }
  if (act === "nudge") {
    if (!state.round || state.round.status !== "live") return;
    const playerId = Number(data.player);
    const hole = holeByNumber(state.round, state.hole);
    const par = hole ? hole.par : 3;
    const current = scoreFor(state.round, playerId, state.hole);
    const delta = Number(data.delta);
    let strokes;
    if (!current) {
      if (delta < 0) strokes = Math.max(1, par - 1);
      else if (delta > 0) strokes = Math.min(20, par + 1);
      else strokes = Math.min(20, Math.max(1, par));
    } else if (delta === 0) {
      return;
    } else {
      strokes = Math.max(1, Math.min(20, current.strokes + delta));
      if (strokes === current.strokes) return;
    }
    rememberScore(playerId, strokes);
    paint();
    queueScore(state.round.id, playerId, state.hole, strokes);
    return;
  }
  if (act === "ask-delete-round") {
    askRemove(
      "Remove this round?",
      `Are you sure you want to remove the round at ${data.name || "this course"}? Every score on the card will be deleted.`,
      "Remove round",
      "delete-round",
      data,
    );
    return;
  }
  if (act === "ask-delete-course") {
    askRemove(
      "Remove this course?",
      `Are you sure you want to remove ${data.name || "this course"}? Layouts and notes go with it.`,
      "Remove course",
      "delete-course",
      data,
    );
    return;
  }
  if (act === "ask-delete-layout") {
    askRemove(
      "Remove this layout?",
      `Are you sure you want to remove ${data.name || "this layout"}?`,
      "Remove layout",
      "delete-layout",
      data,
    );
    return;
  }
  if (act === "ask-delete-review") {
    askRemove(
      "Remove this note?",
      "Are you sure you want to remove your condition note?",
      "Remove note",
      "delete-review",
      data,
    );
    return;
  }
  if (act === "ask-delete-disc") {
    askRemove(
      "Remove this disc?",
      `Are you sure you want to remove ${data.name || "this disc"}?`,
      "Remove disc",
      "delete-disc",
      data,
    );
    return;
  }
  if (act === "ask-remove-card") {
    askRemove(
      "Remove this player?",
      `Are you sure you want to remove ${data.name || "this player"} from the card? Their scores on this round will be deleted.`,
      "Remove player",
      "remove-card",
      data,
    );
    return;
  }
  if (act === "ask-delete-player") {
    askRemove(
      "Remove this player?",
      `Are you sure you want to remove ${data.name || "this player"}? This only works when they have no scorecards or notes. Their discs are removed too.`,
      "Remove player",
      "delete-player",
      data,
    );
    return;
  }
  if (act === "ask-delete-admin-player") {
    askRemove(
      "Remove this player?",
      `Are you sure you want to remove ${data.name || "this player"}? Their discs, notes, and scores are deleted. A round stays if someone else is still on the card.`,
      "Remove player",
      "delete-admin-player",
      data,
    );
    return;
  }
  if (act === "score" && state.round && state.round.status === "live") {
    data.fresh = scoreFor(state.round, Number(data.player), state.hole) ? "" : "1";
    rememberScore(Number(data.player), Number(data.strokes));
  }
  if (act === "clear-score" && state.round) rememberScore(Number(data.player), null);
  run(() => doAct(act, data));
}

function eventElement(event) {
  const node = event.target;
  if (node instanceof Element) return node;
  return node && node.parentElement ? node.parentElement : null;
}

function findControl(event) {
  const target = eventElement(event);
  if (!target) return null;
  if (target.closest("input, textarea, select, a")) return null;
  if (target.classList && target.classList.contains("sheet-back")) return { kind: "sheet" };
  const go = target.closest("[data-go]");
  if (go) return { kind: "go", el: go };
  const tab = target.closest("#nav [data-tab]");
  if (tab) return { kind: "tab", el: tab };
  const act = target.closest("button[data-act]");
  if (act) return { kind: "act", el: act };
  return null;
}

function activate(control) {
  if (!control) return;
  if (control.kind === "sheet") {
    state.sheet = null;
    state.confirm = null;
    paint();
    return;
  }
  if (control.kind === "go" && control.el.closest(".swipe.open")) {
    control.el.closest(".swipe").classList.remove("open");
    return;
  }
  if (control.kind === "go") {
    run(() => navigate(control.el.dataset.go));
    return;
  }
  if (control.kind === "tab") {
    run(() => navigate(control.el.dataset.tab));
    return;
  }
  onAct(control.el);
}

let touchStart = null;
let touchMoved = false;
let swallowEl = null;
let swallowUntil = 0;
let rowDrag = null;
let ignoreClickUntil = 0;

document.addEventListener("touchstart", (event) => {
  const point = event.changedTouches && event.changedTouches[0];
  touchStart = point ? { x: point.clientX, y: point.clientY } : null;
  touchMoved = false;
}, { passive: true });

document.addEventListener("touchmove", (event) => {
  const point = event.touches && event.touches[0];
  if (!point || !touchStart) return;
  if (Math.abs(point.clientX - touchStart.x) > 12 || Math.abs(point.clientY - touchStart.y) > 12) touchMoved = true;
}, { passive: true });

document.addEventListener("touchend", (event) => {
  if (touchMoved) return;
  const control = findControl(event);
  if (!control) return;
  swallowEl = control.el || control;
  swallowUntil = Date.now() + 700;
  event.preventDefault();
  activate(control);
}, { passive: false });

document.addEventListener("click", (event) => {
  if (Date.now() < ignoreClickUntil) {
    ignoreClickUntil = 0;
    event.preventDefault();
    return;
  }
  const control = findControl(event);
  if (control && Date.now() < swallowUntil && (control.el || control) === swallowEl) {
    event.preventDefault();
    return;
  }
  activate(control);
});

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const row = eventElement(event) && eventElement(event).closest(".swipe");
  if (!row) return;
  rowDrag = { row, id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, dx: 0 };
}, { passive: true });

document.addEventListener("pointermove", (event) => {
  if (!rowDrag || event.pointerId !== rowDrag.id) return;
  const dx = event.clientX - rowDrag.x;
  const dy = event.clientY - rowDrag.y;
  if (!rowDrag.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
    rowDrag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  }
  if (rowDrag.axis !== "x") return;
  event.preventDefault();
  touchMoved = true;
  const base = rowDrag.row.classList.contains("open") ? -96 : 0;
  rowDrag.dx = Math.max(-96, Math.min(0, base + dx));
  const face = rowDrag.row.querySelector(".swipe-face");
  if (face) face.style.transform = `translateX(${rowDrag.dx}px)`;
}, { passive: false });

function endRowDrag(event) {
  if (!rowDrag || (event && event.pointerId !== rowDrag.id)) return;
  const row = rowDrag.row;
  const horizontal = rowDrag.axis === "x";
  const dx = rowDrag.dx;
  const face = row.querySelector(".swipe-face");
  rowDrag = null;
  if (!horizontal) return;
  if (face) face.style.transform = "";
  row.classList.toggle("open", dx <= -48);
  document.querySelectorAll(".swipe.open").forEach((other) => {
    if (other !== row) other.classList.remove("open");
  });
  ignoreClickUntil = Date.now() + 600;
}

document.addEventListener("pointerup", endRowDrag);
document.addEventListener("pointercancel", endRowDrag);

document.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement)) return;
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  if (form.dataset.act === "import-backup") {
    const chosen = form.querySelector("#import-file");
    const file = chosen && chosen.files && chosen.files[0];
    const word = String(data.get("word") || "").trim();
    if (!file || word !== "REPLACE") {
      state.error = !file ? "Choose a backup file first." : "Type REPLACE to confirm the import.";
      paint();
      return;
    }
    file.text().then((text) => run(() => importBackup(text))).catch(() => {
      state.error = "That file could not be read.";
      paint();
    });
    return;
  }
  run(() => onSubmit(form.dataset.act, data));
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "import-word") {
    const button = document.getElementById("import-go");
    if (button) button.disabled = target.value.trim() !== "REPLACE";
    return;
  }
  if (target.id === "course-q") {
    state.courseFilter = target.value;
    const list = document.getElementById("course-list");
    if (list) list.innerHTML = courseCards(filteredCourses());
    return;
  }
  if (!state.draft) return;
  if (target.id === "layout-name") state.draft.name = target.value;
  if (target.id === "layout-notes") state.draft.notes = target.value;
  if (target.dataset.holeField) {
    const hole = state.draft.holes[Number(target.dataset.index)];
    if (!hole) return;
    if (target.dataset.holeField === "par") hole.par = Number(target.value);
    else if (target.dataset.holeField === "distance_ft") hole.distance_ft = target.value.trim() === "" ? null : Number(target.value);
    else hole.notes = target.value;
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "start-course") {
    run(() => navigate(`start/${target.value}`, true));
    return;
  }
  if (!state.draft || !target.dataset || !target.dataset.holeField) return;
  const hole = state.draft.holes[Number(target.dataset.index)];
  if (!hole) return;
  if (target.dataset.holeField === "par") hole.par = Number(target.value);
});

window.addEventListener("popstate", () => {
  if (isAdmin() || !state.playerId) return;
  run(() => applyHash());
});

async function bootAdmin() {
  document.getElementById("nav").hidden = true;
  try {
    state.admin = await api("/api/admin/summary");
  } catch (err) {
    state.error = err.message || "Dolf can't reach its server.";
  }
  render();
}

async function boot() {
  state.playerId = Number(localStorage.getItem("dolfPlayerId")) || null;
  try {
    state.players = await api("/api/players");
  } catch (err) {
    state.error = "Dolf can't reach its server.";
    render();
    return;
  }
  if (state.playerId && !state.players.some((player) => player.id === state.playerId)) {
    state.playerId = null;
    localStorage.removeItem("dolfPlayerId");
  }
  if (!location.hash) history.replaceState(null, "", "#home");
  if (state.playerId) {
    try {
      await applyHash();
    } catch (err) {
      state.error = err.message;
    }
  }
  render();
}

if (isAdmin()) bootAdmin();
else boot();
