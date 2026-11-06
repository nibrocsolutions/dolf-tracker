export type Hole = {
  number: number;
  par: number;
  distanceFt: number;
};

export type Course = {
  id: string;
  name: string;
  city: string;
  region: string;
  holes: Hole[];
  favorite: boolean;
  sample: boolean;
};

export type RoundPlayer = {
  id: string;
  name: string;
  scores: Array<number | null>;
};

export type Round = {
  id: string;
  courseId: string;
  courseName: string;
  city: string;
  region: string;
  holes: Hole[];
  players: RoundPlayer[];
  currentHole: number;
  startedAt: string;
  finishedAt: string | null;
};

export type Store = {
  version: 1;
  courses: Course[];
  rounds: Round[];
};

export type CourseInput = {
  name: string;
  city: string;
  region: string;
  holes: Array<{ par: number; distanceFt: number }>;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
