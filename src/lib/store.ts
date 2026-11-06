import {
  MAX_DISTANCE,
  MAX_HOLES,
  MAX_PAR,
  MAX_PLAYERS,
  MIN_DISTANCE,
  MIN_PAR,
  clampScore,
  countMissing,
} from "./scoring";
import { seedStore } from "./seed";
import type { Course, CourseInput, Hole, Result, Round, RoundPlayer, Store } from "../types";

const STORAGE_KEY = "dolf-tracker-v1";

function fail(error: string): Result<never> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function renumber(holes: Array<{ par: number; distanceFt: number }>): Hole[] {
  return holes.map((hole, index) => ({
    number: index + 1,
    par: hole.par,
    distanceFt: hole.distanceFt,
  }));
}

export function validateCourseInput(input: CourseInput): Result<CourseInput> {
  const name = cleanText(input.name);
  const city = cleanText(input.city);
  const region = cleanText(input.region);
  if (!name) return fail("Name the course.");
  if (name.length > 48) return fail("Course name needs to be 48 characters or fewer.");
  if (city.length > 32) return fail("City needs to be 32 characters or fewer.");
  if (region.length > 24) return fail("Region needs to be 24 characters or fewer.");
  if (input.holes.length < 1) return fail("Add at least one hole.");
  if (input.holes.length > MAX_HOLES) return fail(`A course can have up to ${MAX_HOLES} holes.`);

  const holes: Array<{ par: number; distanceFt: number }> = [];
  for (let index = 0; index < input.holes.length; index += 1) {
    const hole = input.holes[index];
    const label = `Hole ${index + 1}`;
    if (!hole) return fail(`${label} is missing.`);
    if (!Number.isInteger(hole.par) || hole.par < MIN_PAR || hole.par > MAX_PAR) {
      return fail(`${label} par must be from ${MIN_PAR} to ${MAX_PAR}.`);
    }
    if (!Number.isFinite(hole.distanceFt)) return fail(`${label} needs a distance in feet.`);
    const distanceFt = Math.round(hole.distanceFt);
    if (distanceFt < MIN_DISTANCE || distanceFt > MAX_DISTANCE) {
      return fail(`${label} distance must be from ${MIN_DISTANCE} to ${MAX_DISTANCE.toLocaleString("en-US")} feet.`);
    }
    holes.push({ par: hole.par, distanceFt });
  }

  return { ok: true, value: { name, city, region, holes } };
}

function playerNames(names: string[]): Result<string[]> {
  const cleaned = names.map((name) => cleanText(name)).filter(Boolean);
  if (cleaned.length < 1) return fail("Add at least one player.");
  if (cleaned.length > MAX_PLAYERS) return fail(`A card holds up to ${MAX_PLAYERS} players.`);
  const keys = new Set(cleaned.map((name) => name.toLowerCase()));
  if (keys.size !== cleaned.length) return fail("Player names need to be different.");
  if (cleaned.some((name) => name.length > 24)) return fail("Player names need to be 24 characters or fewer.");
  return { ok: true, value: cleaned };
}

function mapRound(store: Store, roundId: string, update: (round: Round) => Round): Result<{ store: Store }> {
  let found = false;
  const rounds = store.rounds.map((round) => {
    if (round.id !== roundId) return round;
    found = true;
    return update(round);
  });
  if (!found) return fail("Round not found.");
  return { ok: true, value: { store: { ...store, rounds } } };
}

export function createCourse(store: Store, input: CourseInput): Result<{ store: Store; courseId: string }> {
  const validated = validateCourseInput(input);
  if (!validated.ok) return validated;
  const course: Course = {
    id: crypto.randomUUID(),
    name: validated.value.name,
    city: validated.value.city,
    region: validated.value.region,
    holes: renumber(validated.value.holes),
    favorite: false,
    sample: false,
  };
  return { ok: true, value: { store: { ...store, courses: [...store.courses, course] }, courseId: course.id } };
}

export function updateCourse(
  store: Store,
  courseId: string,
  input: CourseInput,
): Result<{ store: Store; courseId: string }> {
  const validated = validateCourseInput(input);
  if (!validated.ok) return validated;
  let found = false;
  const courses = store.courses.map((course) => {
    if (course.id !== courseId) return course;
    found = true;
    return {
      ...course,
      name: validated.value.name,
      city: validated.value.city,
      region: validated.value.region,
      holes: renumber(validated.value.holes),
      sample: false,
    };
  });
  if (!found) return fail("Course not found.");
  return { ok: true, value: { store: { ...store, courses }, courseId } };
}

export function deleteCourse(store: Store, courseId: string): Result<{ store: Store }> {
  if (!store.courses.some((course) => course.id === courseId)) return fail("Course not found.");
  return {
    ok: true,
    value: { store: { ...store, courses: store.courses.filter((course) => course.id !== courseId) } },
  };
}

export function toggleFavorite(store: Store, courseId: string): Result<{ store: Store }> {
  let found = false;
  const courses = store.courses.map((course) => {
    if (course.id !== courseId) return course;
    found = true;
    return { ...course, favorite: !course.favorite };
  });
  if (!found) return fail("Course not found.");
  return { ok: true, value: { store: { ...store, courses } } };
}

export function sortCourses(courses: Course[]): Course[] {
  return [...courses].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function courseMatches(course: Course, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [course.name, course.city, course.region].join(" ").toLowerCase().includes(needle);
}

export function startRound(
  store: Store,
  input: { courseId: string; playerNames: string[]; now?: Date },
): Result<{ store: Store; roundId: string }> {
  const course = store.courses.find((item) => item.id === input.courseId);
  if (!course) return fail("That course is no longer on this device.");
  const names = playerNames(input.playerNames);
  if (!names.ok) return names;
  const round: Round = {
    id: crypto.randomUUID(),
    courseId: course.id,
    courseName: course.name,
    city: course.city,
    region: course.region,
    holes: course.holes.map((hole) => ({ ...hole })),
    players: names.value.map((name) => ({
      id: crypto.randomUUID(),
      name,
      scores: course.holes.map(() => null),
    })),
    currentHole: 1,
    startedAt: (input.now ?? new Date()).toISOString(),
    finishedAt: null,
  };
  return { ok: true, value: { store: { ...store, rounds: [...store.rounds, round] }, roundId: round.id } };
}

export function setScore(
  store: Store,
  roundId: string,
  playerId: string,
  holeIndex: number,
  strokes: number,
): Result<{ store: Store }> {
  const round = store.rounds.find((item) => item.id === roundId);
  if (!round) return fail("Round not found.");
  if (holeIndex < 0 || holeIndex >= round.holes.length) return fail("That hole is not on this layout.");
  const player = round.players.find((item) => item.id === playerId);
  if (!player) return fail("Player not found.");
  const score = clampScore(strokes);
  if (player.scores[holeIndex] === score) return { ok: true, value: { store } };
  return mapRound(store, roundId, (current) => ({
    ...current,
    players: current.players.map((item) => {
      if (item.id !== playerId) return item;
      const scores = current.holes.map((_, index) => {
        const existing = item.scores[index];
        return typeof existing === "number" ? existing : null;
      });
      scores[holeIndex] = score;
      return { ...item, scores };
    }),
  }));
}

export function setCurrentHole(store: Store, roundId: string, holeNumber: number): Result<{ store: Store }> {
  const round = store.rounds.find((item) => item.id === roundId);
  if (!round) return fail("Round not found.");
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > round.holes.length) {
    return fail("That hole is not on this layout.");
  }
  if (round.currentHole === holeNumber) return { ok: true, value: { store } };
  return mapRound(store, roundId, (current) => ({ ...current, currentHole: holeNumber }));
}

export function addPlayer(
  store: Store,
  roundId: string,
  name: string,
): Result<{ store: Store }> {
  const cleaned = playerNames([name]);
  if (!cleaned.ok) return cleaned;
  const playerName = cleaned.value[0];
  if (!playerName) return fail("Enter a player name.");
  let error: string | null = null;
  const result = mapRound(store, roundId, (round) => {
    if (round.finishedAt) {
      error = "Finished rounds keep the card they were saved with.";
      return round;
    }
    if (round.players.length >= MAX_PLAYERS) {
      error = `A card holds up to ${MAX_PLAYERS} players.`;
      return round;
    }
    if (round.players.some((player) => player.name.toLowerCase() === playerName.toLowerCase())) {
      error = "That player is already on the card.";
      return round;
    }
    const player: RoundPlayer = {
      id: crypto.randomUUID(),
      name: playerName,
      scores: round.holes.map(() => null),
    };
    return { ...round, players: [...round.players, player] };
  });
  if (error) return fail(error);
  return result;
}

export function removePlayer(store: Store, roundId: string, playerId: string): Result<{ store: Store }> {
  let error: string | null = null;
  const result = mapRound(store, roundId, (round) => {
    if (round.finishedAt) {
      error = "Finished rounds keep the card they were saved with.";
      return round;
    }
    if (round.players.length <= 1) {
      error = "A card needs at least one player.";
      return round;
    }
    if (!round.players.some((player) => player.id === playerId)) {
      error = "Player not found.";
      return round;
    }
    return { ...round, players: round.players.filter((player) => player.id !== playerId) };
  });
  if (error) return fail(error);
  return result;
}

export function finishRound(
  store: Store,
  roundId: string,
  options?: { fillPar?: boolean; now?: Date },
): Result<{ store: Store }> {
  const fillPar = options?.fillPar ?? false;
  let error: string | null = null;
  const result = mapRound(store, roundId, (round) => {
    if (round.finishedAt) return round;
    const missing = countMissing(round.holes.length, round.players);
    if (missing > 0 && !fillPar) {
      error = "Score every hole before finishing.";
      return round;
    }
    const players = round.players.map((player) => ({
      ...player,
      scores: round.holes.map((hole, index) => {
        const score = player.scores[index];
        if (typeof score === "number") return score;
        return hole.par;
      }),
    }));
    return {
      ...round,
      players,
      finishedAt: (options?.now ?? new Date()).toISOString(),
    };
  });
  if (error) return fail(error);
  return result;
}

export function deleteRound(store: Store, roundId: string): Result<{ store: Store }> {
  if (!store.rounds.some((round) => round.id === roundId)) return fail("Round not found.");
  return {
    ok: true,
    value: { store: { ...store, rounds: store.rounds.filter((round) => round.id !== roundId) } },
  };
}

function parseHole(value: unknown, number: number): Hole | null {
  if (!isRecord(value)) return null;
  const { par, distanceFt } = value;
  if (typeof par !== "number" || !Number.isInteger(par) || par < MIN_PAR || par > MAX_PAR) return null;
  if (
    typeof distanceFt !== "number" ||
    !Number.isInteger(distanceFt) ||
    distanceFt < MIN_DISTANCE ||
    distanceFt > MAX_DISTANCE
  ) {
    return null;
  }
  return { number, par, distanceFt };
}

function parseCourse(value: unknown): Course | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  if (typeof value.city !== "string" || typeof value.region !== "string") return null;
  if (typeof value.favorite !== "boolean" || typeof value.sample !== "boolean") return null;
  if (!Array.isArray(value.holes) || value.holes.length < 1 || value.holes.length > MAX_HOLES) return null;
  const holes: Hole[] = [];
  for (let index = 0; index < value.holes.length; index += 1) {
    const hole = parseHole(value.holes[index], index + 1);
    if (!hole) return null;
    holes.push(hole);
  }
  return {
    id: value.id,
    name: value.name,
    city: value.city,
    region: value.region,
    favorite: value.favorite,
    sample: value.sample,
    holes,
  };
}

function parseRound(value: unknown): Round | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.courseId !== "string") return null;
  if (typeof value.courseName !== "string" || typeof value.city !== "string" || typeof value.region !== "string") {
    return null;
  }
  if (typeof value.startedAt !== "string") return null;
  if (value.finishedAt !== null && typeof value.finishedAt !== "string") return null;
  if (!Array.isArray(value.holes) || value.holes.length < 1) return null;
  const holes: Hole[] = [];
  for (let index = 0; index < value.holes.length; index += 1) {
    const hole = parseHole(value.holes[index], index + 1);
    if (!hole) return null;
    holes.push(hole);
  }
  if (!Array.isArray(value.players) || value.players.length < 1 || value.players.length > MAX_PLAYERS) return null;
  const players: RoundPlayer[] = [];
  for (const player of value.players) {
    if (!isRecord(player) || typeof player.id !== "string" || typeof player.name !== "string") return null;
    if (!Array.isArray(player.scores) || player.scores.length !== holes.length) return null;
    const scores: Array<number | null> = [];
    for (const score of player.scores) {
      if (score === null) {
        scores.push(null);
        continue;
      }
      if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 15) return null;
      scores.push(score);
    }
    players.push({ id: player.id, name: player.name, scores });
  }
  const currentHole = value.currentHole;
  if (typeof currentHole !== "number" || !Number.isInteger(currentHole) || currentHole < 1 || currentHole > holes.length) {
    return null;
  }
  return {
    id: value.id,
    courseId: value.courseId,
    courseName: value.courseName,
    city: value.city,
    region: value.region,
    holes,
    players,
    currentHole,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
  };
}

export function parseStore(input: unknown): Store | null {
  if (!isRecord(input) || input.version !== 1) return null;
  if (!Array.isArray(input.courses) || !Array.isArray(input.rounds)) return null;
  const courses: Course[] = [];
  for (const course of input.courses) {
    const parsed = parseCourse(course);
    if (!parsed) return null;
    courses.push(parsed);
  }
  const rounds: Round[] = [];
  for (const round of input.rounds) {
    const parsed = parseRound(round);
    if (!parsed) return null;
    rounds.push(parsed);
  }
  return { version: 1, courses, rounds };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedStore();
    const parsed = parseStore(JSON.parse(raw));
    return parsed ?? seedStore();
  } catch {
    return seedStore();
  }
}

export function saveStore(store: Store): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export { STORAGE_KEY };
