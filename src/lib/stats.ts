import { resultBucket, runningTotal, type Bucket } from "./scoring";
import type { Round } from "../types";

export type CourseStat = {
  courseId: string;
  courseName: string;
  rounds: number;
  avgDiff: number;
};

export type BestRound = {
  roundId: string;
  courseName: string;
  diff: number;
  strokes: number;
  finishedAt: string;
};

export type CareerStats = {
  rounds: number;
  courses: number;
  avgDiff: number | null;
  underPar: number;
  best: BestRound | null;
  buckets: Record<Bucket, number>;
  holes: number;
  byCourse: CourseStat[];
};

function emptyBuckets(): Record<Bucket, number> {
  return { ace: 0, eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
}

export function playerNames(rounds: Round[]): string[] {
  const seen = new Map<string, string>();
  for (const round of rounds) {
    if (!round.finishedAt) continue;
    for (const player of round.players) {
      const name = player.name.trim();
      const key = name.toLowerCase();
      if (name && !seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()];
}

export function careerStats(rounds: Round[], playerName: string): CareerStats {
  const key = playerName.trim().toLowerCase();
  const buckets = emptyBuckets();
  const groups = new Map<string, { courseId: string; courseName: string; diffs: number[] }>();
  let best: BestRound | null = null;
  let diffSum = 0;
  let holeCount = 0;
  let roundCount = 0;

  for (const round of rounds) {
    if (!round.finishedAt) continue;
    const player = round.players.find((item) => item.name.trim().toLowerCase() === key);
    if (!player) continue;
    const total = runningTotal(round.holes, player.scores);
    if (total.scored !== round.holes.length) continue;
    roundCount += 1;
    diffSum += total.diff;
    const candidate: BestRound = {
      roundId: round.id,
      courseName: round.courseName,
      diff: total.diff,
      strokes: total.strokes,
      finishedAt: round.finishedAt,
    };
    if (
      !best ||
      candidate.diff < best.diff ||
      (candidate.diff === best.diff && candidate.strokes < best.strokes) ||
      (candidate.diff === best.diff &&
        candidate.strokes === best.strokes &&
        candidate.finishedAt > best.finishedAt)
    ) {
      best = candidate;
    }
    round.holes.forEach((hole, index) => {
      const score = player.scores[index];
      if (typeof score !== "number") return;
      buckets[resultBucket(score, hole.par)] += 1;
      holeCount += 1;
    });
    const group = groups.get(round.courseId) ?? {
      courseId: round.courseId,
      courseName: round.courseName,
      diffs: [],
    };
    group.diffs.push(total.diff);
    group.courseName = round.courseName;
    groups.set(round.courseId, group);
  }

  const byCourse = [...groups.values()]
    .map((group) => ({
      courseId: group.courseId,
      courseName: group.courseName,
      rounds: group.diffs.length,
      avgDiff: group.diffs.reduce((sum, diff) => sum + diff, 0) / group.diffs.length,
    }))
    .sort((a, b) => b.rounds - a.rounds || a.courseName.localeCompare(b.courseName));

  return {
    rounds: roundCount,
    courses: groups.size,
    avgDiff: roundCount === 0 ? null : diffSum / roundCount,
    underPar: buckets.ace + buckets.eagle + buckets.birdie,
    best,
    buckets,
    holes: holeCount,
    byCourse,
  };
}
