import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sortCourses, saveStore, loadStore } from "./lib/store";
import * as model from "./lib/store";
import type { Course, CourseInput, Result, Round, Store } from "./types";

type StoreApi = {
  courses: Course[];
  rounds: Round[];
  createCourse: (input: CourseInput) => Result<{ courseId: string }>;
  updateCourse: (courseId: string, input: CourseInput) => Result<{ courseId: string }>;
  deleteCourse: (courseId: string) => Result<null>;
  toggleFavorite: (courseId: string) => void;
  startRound: (courseId: string, playerNames: string[]) => Result<{ roundId: string }>;
  setScore: (roundId: string, playerId: string, holeIndex: number, strokes: number) => Result<null>;
  setCurrentHole: (roundId: string, holeNumber: number) => void;
  addPlayer: (roundId: string, name: string) => Result<null>;
  removePlayer: (roundId: string, playerId: string) => Result<null>;
  finishRound: (roundId: string, fillPar: boolean) => Result<null>;
  deleteRound: (roundId: string) => Result<null>;
  replaceStore: (next: Store) => void;
  exportJson: () => string;
};

const StoreContext = createContext<StoreApi | null>(null);

function unchanged<T>(result: Result<{ store: Store }>, store: Store): Result<T> | null {
  if (!result.ok) return result;
  if (result.value.store === store) return { ok: true, value: null as T };
  return null;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => loadStore());

  useEffect(() => {
    saveStore(store);
  }, [store]);

  const api = useMemo<StoreApi>(() => {
    const commit = (result: Result<{ store: Store }>): Result<null> => {
      const same = unchanged<null>(result, store);
      if (same) return same;
      if (!result.ok) return result;
      setStore(result.value.store);
      return { ok: true, value: null };
    };

    return {
      courses: sortCourses(store.courses),
      rounds: [...store.rounds].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      createCourse: (input) => {
        const result = model.createCourse(store, input);
        if (!result.ok) return result;
        setStore(result.value.store);
        return { ok: true, value: { courseId: result.value.courseId } };
      },
      updateCourse: (courseId, input) => {
        const result = model.updateCourse(store, courseId, input);
        if (!result.ok) return result;
        setStore(result.value.store);
        return { ok: true, value: { courseId: result.value.courseId } };
      },
      deleteCourse: (courseId) => commit(model.deleteCourse(store, courseId)),
      toggleFavorite: (courseId) => {
        commit(model.toggleFavorite(store, courseId));
      },
      startRound: (courseId, playerNames) => {
        const result = model.startRound(store, { courseId, playerNames });
        if (!result.ok) return result;
        setStore(result.value.store);
        return { ok: true, value: { roundId: result.value.roundId } };
      },
      setScore: (roundId, playerId, holeIndex, strokes) =>
        commit(model.setScore(store, roundId, playerId, holeIndex, strokes)),
      setCurrentHole: (roundId, holeNumber) => {
        commit(model.setCurrentHole(store, roundId, holeNumber));
      },
      addPlayer: (roundId, name) => commit(model.addPlayer(store, roundId, name)),
      removePlayer: (roundId, playerId) => commit(model.removePlayer(store, roundId, playerId)),
      finishRound: (roundId, fillPar) => commit(model.finishRound(store, roundId, { fillPar })),
      deleteRound: (roundId) => commit(model.deleteRound(store, roundId)),
      replaceStore: (next) => setStore(next),
      exportJson: () => JSON.stringify(store, null, 2),
    };
  }, [store]);

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
