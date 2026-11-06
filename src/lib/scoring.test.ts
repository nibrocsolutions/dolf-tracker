import { describe, expect, it } from "vitest";
import {
  formatAverage,
  formatVsPar,
  nextScore,
  resultBucket,
  runningTotal,
  totalPar,
} from "./scoring";
import type { Hole } from "../types";

const holes: Hole[] = [
  { number: 1, par: 3, distanceFt: 200 },
  { number: 2, par: 4, distanceFt: 400 },
  { number: 3, par: 3, distanceFt: 250 },
];

describe("scoring", () => {
  it("steps from par when a hole has no score yet", () => {
    expect(nextScore(null, 3, -1)).toBe(2);
    expect(nextScore(null, 3, 1)).toBe(4);
    expect(nextScore(2, 3, -1)).toBe(1);
    expect(nextScore(1, 3, -1)).toBe(1);
    expect(nextScore(15, 3, 1)).toBe(15);
  });

  it("classifies aces, birdies, and bogeys", () => {
    expect(resultBucket(1, 3)).toBe("ace");
    expect(resultBucket(2, 4)).toBe("eagle");
    expect(resultBucket(2, 3)).toBe("birdie");
    expect(resultBucket(3, 3)).toBe("par");
    expect(resultBucket(4, 3)).toBe("bogey");
    expect(resultBucket(5, 3)).toBe("double");
  });

  it("formats scores against par", () => {
    expect(formatVsPar(0)).toBe("E");
    expect(formatVsPar(-2)).toBe("−2");
    expect(formatVsPar(1)).toBe("+1");
    expect(formatAverage(-1.04)).toBe("−1");
    expect(formatAverage(1.26)).toBe("+1.3");
    expect(formatAverage(0)).toBe("E");
  });

  it("totals only scored holes", () => {
    const total = runningTotal(holes, [2, null, 4]);
    expect(total).toMatchObject({ strokes: 6, par: 6, diff: 0, scored: 2, holes: 3 });
    expect(totalPar(holes)).toBe(10);
  });
});
