import { describe, expect, it } from "vitest";
import { SAMPLE_COURSES, seedStore } from "./seed";
import { runningTotal, totalPar } from "./scoring";
import { careerStats } from "./stats";
import {
  createCourse,
  deleteCourse,
  finishRound,
  parseStore,
  setCurrentHole,
  setScore,
  startRound,
  updateCourse,
} from "./store";

describe("store", () => {
  it("starts a round from a snapshot of the course", () => {
    const started = startRound(seedStore(), {
      courseId: SAMPLE_COURSES.harbor,
      playerNames: [" You ", "Sam"],
      now: new Date("2026-06-01T15:00:00.000Z"),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const round = started.value.store.rounds.find((item) => item.id === started.value.roundId);
    expect(round?.players.map((player) => player.name)).toEqual(["You", "Sam"]);
    expect(round?.holes).toHaveLength(9);
    expect(round?.players[0]?.scores).toEqual(Array(9).fill(null));

    const edited = updateCourse(started.value.store, SAMPLE_COURSES.harbor, {
      name: "Harbor Pines",
      city: "Portland",
      region: "ME",
      holes: [{ par: 3, distanceFt: 180 }],
    });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const saved = edited.value.store.rounds.find((item) => item.id === started.value.roundId);
    expect(saved?.holes).toHaveLength(9);
    expect(edited.value.store.courses.find((course) => course.id === SAMPLE_COURSES.harbor)?.sample).toBe(false);
  });

  it("rejects a duplicate card name and an unfinished round", () => {
    const started = startRound(seedStore(), {
      courseId: SAMPLE_COURSES.harbor,
      playerNames: ["You", "you"],
    });
    expect(started.ok).toBe(false);

    const roundStart = startRound(seedStore(), {
      courseId: SAMPLE_COURSES.harbor,
      playerNames: ["You"],
    });
    expect(roundStart.ok).toBe(true);
    if (!roundStart.ok) return;
    const finished = finishRound(roundStart.value.store, roundStart.value.roundId);
    expect(finished.ok).toBe(false);
  });

  it("records open holes as par and keeps the scorecard after the course is deleted", () => {
    const started = startRound(seedStore(), {
      courseId: SAMPLE_COURSES.harbor,
      playerNames: ["You"],
      now: new Date("2026-06-02T15:00:00.000Z"),
    });
    if (!started.ok) throw new Error("round did not start");
    const round = started.value.store.rounds[0];
    const player = round?.players[0];
    if (!round || !player) throw new Error("missing player");
    let store = started.value.store;
    const first = setScore(store, round.id, player.id, 0, 2);
    if (!first.ok) throw new Error(first.error);
    store = first.value.store;
    const moved = setCurrentHole(store, round.id, 2);
    if (!moved.ok) throw new Error(moved.error);
    store = moved.value.store;
    const done = finishRound(store, round.id, {
      fillPar: true,
      now: new Date("2026-06-02T16:00:00.000Z"),
    });
    if (!done.ok) throw new Error(done.error);
    store = done.value.store;
    const saved = store.rounds[0];
    if (!saved) throw new Error("missing round");
    expect(saved.finishedAt).toBe("2026-06-02T16:00:00.000Z");
    expect(saved.currentHole).toBe(2);
    expect(saved.players[0]?.scores[0]).toBe(2);
    expect(saved.players[0]?.scores.slice(1)).toEqual(saved.holes.slice(1).map((hole) => hole.par));
    const total = runningTotal(saved.holes, saved.players[0]?.scores ?? []);
    expect(total.diff).toBe(2 - (saved.holes[0]?.par ?? 0));

    const removed = deleteCourse(store, SAMPLE_COURSES.harbor);
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.value.store.courses.some((course) => course.id === SAMPLE_COURSES.harbor)).toBe(false);
    expect(removed.value.store.rounds[0]?.courseName).toBe("Harbor Pines");
    expect(totalPar(saved.holes)).toBeGreaterThan(0);

    const stats = careerStats(removed.value.store.rounds, "you");
    expect(stats.rounds).toBe(1);
    expect(stats.best?.diff).toBe(total.diff);
    expect(stats.buckets.birdie).toBe(1);
  });

  it("round-trips a backup and rejects a broken one", () => {
    const started = startRound(seedStore(), {
      courseId: SAMPLE_COURSES.redClay,
      playerNames: ["You"],
    });
    if (!started.ok) throw new Error("round did not start");
    expect(parseStore(JSON.parse(JSON.stringify(started.value.store)))).toEqual(started.value.store);
    expect(parseStore({ version: 1, courses: [], rounds: [{ id: "x" }] })).toBeNull();
  });

  it("creates a course with normalized holes", () => {
    const created = createCourse(seedStore(), {
      name: "  Mill Creek  ",
      city: "Ithaca",
      region: "NY",
      holes: [
        { par: 3, distanceFt: 250.4 },
        { par: 4, distanceFt: 480 },
      ],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const course = created.value.store.courses.find((item) => item.id === created.value.courseId);
    expect(course?.name).toBe("Mill Creek");
    expect(course?.holes.map((hole) => hole.distanceFt)).toEqual([250, 480]);
    expect(course?.sample).toBe(false);
  });
});
