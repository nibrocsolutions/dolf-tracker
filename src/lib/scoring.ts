import type { Hole } from "../types";

export const MIN_STROKES = 1;
export const MAX_STROKES = 15;
export const MIN_PAR = 2;
export const MAX_PAR = 6;
export const MIN_DISTANCE = 50;
export const MAX_DISTANCE = 2000;
export const MAX_HOLES = 36;
export const MAX_PLAYERS = 8;

export const BUCKETS = ["ace", "eagle", "birdie", "par", "bogey", "double"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  ace: "Ace",
  eagle: "Eagle+",
  birdie: "Birdie",
  par: "Par",
  bogey: "Bogey",
  double: "Double+",
};

export type RunningTotal = {
  strokes: number;
  par: number;
  diff: number;
  scored: number;
  holes: number;
};

export function clampScore(strokes: number): number {
  if (!Number.isFinite(strokes)) return MIN_STROKES;
  return Math.min(MAX_STROKES, Math.max(MIN_STROKES, Math.round(strokes)));
}

export function nextScore(current: number | null, par: number, delta: -1 | 1): number {
  const base = current == null ? par : current;
  return clampScore(base + delta);
}

export function resultBucket(strokes: number, par: number): Bucket {
  if (strokes === 1) return "ace";
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double";
}

export function formatVsPar(diff: number): string {
  if (diff === 0) return "E";
  const text = diff > 0 ? `+${diff}` : `${diff}`;
  return text.replace("-", "−");
}

export function formatAverage(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "E";
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  const text = rounded > 0 ? `+${body}` : body;
  return text.replace("-", "−");
}

export function totalPar(holes: Hole[]): number {
  return holes.reduce((sum, hole) => sum + hole.par, 0);
}

export function totalDistance(holes: Hole[]): number {
  return holes.reduce((sum, hole) => sum + hole.distanceFt, 0);
}

export function formatFeet(feet: number): string {
  return `${feet.toLocaleString("en-US")} ft`;
}

export function formatLocation(city: string, region: string): string {
  const text = [city.trim(), region.trim()].filter(Boolean).join(", ");
  return text || "Location not set";
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function runningTotal(
  holes: Hole[],
  scores: ReadonlyArray<number | null | undefined>,
): RunningTotal {
  let strokes = 0;
  let par = 0;
  let scored = 0;
  holes.forEach((hole, index) => {
    const score = scores[index];
    if (typeof score !== "number") return;
    strokes += score;
    par += hole.par;
    scored += 1;
  });
  return { strokes, par, diff: strokes - par, scored, holes: holes.length };
}

export function countMissing(
  holeCount: number,
  players: ReadonlyArray<{ scores: ReadonlyArray<number | null | undefined> }>,
): number {
  return players.reduce((sum, player) => {
    let missing = 0;
    for (let index = 0; index < holeCount; index += 1) {
      if (typeof player.scores[index] !== "number") missing += 1;
    }
    return sum + missing;
  }, 0);
}

export function vsParClass(diff: number): string {
  if (diff < 0) return "vs-under";
  if (diff > 0) return "vs-over";
  return "vs-even";
}

export function scoreClass(strokes: number | null, par: number): string {
  if (strokes == null) return "score score-empty";
  return `score score-${resultBucket(strokes, par)}`;
}
