import type { Course, Hole, Store } from "../types";

export const SAMPLE_COURSES = {
  cedar: "course-cedar",
  quarry: "course-quarry",
  harbor: "course-harbor",
  redClay: "course-red-clay",
} as const;

function layout(rows: Array<[number, number]>): Hole[] {
  return rows.map(([par, distanceFt], index) => ({
    number: index + 1,
    par,
    distanceFt,
  }));
}

const courses: Course[] = [
  {
    id: SAMPLE_COURSES.cedar,
    name: "Cedar Hollow",
    city: "Asheville",
    region: "NC",
    favorite: true,
    sample: true,
    holes: layout([
      [3, 285],
      [3, 242],
      [4, 512],
      [3, 318],
      [3, 201],
      [3, 356],
      [4, 588],
      [3, 274],
      [3, 263],
      [3, 339],
      [3, 410],
      [3, 218],
      [3, 297],
      [3, 368],
      [3, 248],
      [3, 233],
      [3, 390],
      [3, 276],
    ]),
  },
  {
    id: SAMPLE_COURSES.quarry,
    name: "Quarry Ridge",
    city: "Burlington",
    region: "VT",
    favorite: false,
    sample: true,
    holes: layout([
      [4, 545],
      [3, 312],
      [3, 388],
      [4, 642],
      [3, 267],
      [4, 610],
      [3, 294],
      [3, 351],
      [4, 528],
      [3, 246],
      [3, 419],
      [3, 305],
      [4, 636],
      [3, 278],
      [3, 334],
      [3, 221],
      [4, 701],
      [3, 362],
    ]),
  },
  {
    id: SAMPLE_COURSES.harbor,
    name: "Harbor Pines",
    city: "Portland",
    region: "ME",
    favorite: false,
    sample: true,
    holes: layout([
      [3, 210],
      [3, 185],
      [3, 250],
      [4, 420],
      [3, 230],
      [3, 275],
      [3, 190],
      [3, 310],
      [4, 455],
    ]),
  },
  {
    id: SAMPLE_COURSES.redClay,
    name: "Red Clay Park",
    city: "Durham",
    region: "NC",
    favorite: false,
    sample: true,
    holes: layout([
      [3, 198],
      [3, 176],
      [3, 242],
      [3, 165],
      [3, 221],
      [3, 287],
      [3, 154],
      [3, 263],
      [3, 209],
      [3, 238],
      [3, 171],
      [3, 302],
      [3, 184],
      [3, 256],
      [3, 147],
      [3, 219],
      [3, 278],
      [3, 193],
    ]),
  },
];

export function seedStore(): Store {
  return {
    version: 1,
    courses: courses.map((course) => ({
      ...course,
      holes: course.holes.map((hole) => ({ ...hole })),
    })),
    rounds: [],
  };
}
