import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NotFound } from "../components/NotFound";
import { MAX_HOLES, MIN_PAR, MAX_PAR } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";
import type { Hole } from "../types";


type DraftHole = { par: number; distance: string };

function toDraft(holes: Hole[]): DraftHole[] {
  return holes.map((hole) => ({ par: hole.par, distance: String(hole.distanceFt) }));
}

function starter(count: number): DraftHole[] {
  return Array.from({ length: count }, () => ({ par: 3, distance: "280" }));
}

export function CourseFormPage() {
  const { courseId } = useParams();
  return <CourseForm key={courseId ?? "new"} courseId={courseId} />;
}

function CourseForm({ courseId }: { courseId?: string }) {
  const { courses, createCourse, updateCourse } = useStore();
  const navigate = useNavigate();
  const existing = courseId ? courses.find((course) => course.id === courseId) : undefined;
  const editing = Boolean(courseId);
  useTitle(editing ? "Edit course" : "New course");
  const [name, setName] = useState(existing?.name ?? "");
  const [city, setCity] = useState(existing?.city ?? "");
  const [region, setRegion] = useState(existing?.region ?? "");
  const [holes, setHoles] = useState<DraftHole[]>(existing ? toDraft(existing.holes) : starter(9));
  const [error, setError] = useState("");

  if (editing && !existing) return <NotFound />;

  function updateHole(index: number, patch: Partial<DraftHole>) {
    setHoles((current) => current.map((hole, holeIndex) => (holeIndex === index ? { ...hole, ...patch } : hole)));
  }

  function save() {
    const input = {
      name,
      city,
      region,
      holes: holes.map((hole) => ({ par: hole.par, distanceFt: Number(hole.distance) })),
    };
    const result = existing ? updateCourse(existing.id, input) : createCourse(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/courses/${result.value.courseId}`);
  }

  const pars = holes.map((hole) => hole.par);
  const distances = holes.map((hole) => Number(hole.distance));
  const distanceSum = distances.reduce((sum, distance) => (Number.isFinite(distance) ? sum + distance : sum), 0);

  return (
    <section className="page">
      <p className="eyebrow">{editing ? "Edit layout" : "New course"}</p>
      <h1>{editing ? existing?.name : "Add a course"}</h1>
      <div className="paper form-card">
        <label>
          Course name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={48} required />
        </label>
        <div className="split">
          <label>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={32} />
          </label>
          <label>
            Region
            <input value={region} onChange={(event) => setRegion(event.target.value)} maxLength={24} placeholder="NC" />
          </label>
        </div>
        <p className="muted">
          {holes.length} holes · Par {pars.reduce((sum, par) => sum + par, 0)} · {Math.round(distanceSum).toLocaleString("en-US")} ft
        </p>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setHoles((current) => [...current, { par: 3, distance: "280" }])}
            disabled={holes.length >= MAX_HOLES}
          >
            Add hole
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={holes.length >= MAX_HOLES}
            onClick={() =>
              setHoles((current) => {
                const room = MAX_HOLES - current.length;
                const count = Math.min(9, room);
                return [...current, ...starter(count)];
              })
            }
          >
            Add 9 holes
          </button>
        </div>
        {holes.map((hole, index) => (
          <div className="hole-edit" key={index}>
            <strong>Hole {index + 1}</strong>
            <button
              type="button"
              className="text-button"
              disabled={holes.length === 1}
              onClick={() => setHoles((current) => current.filter((_, holeIndex) => holeIndex !== index))}
            >
              Remove
            </button>
            <div className="hole-edit-controls">
              <div className="mini-step">
                <button
                  type="button"
                  aria-label={`Lower par for hole ${index + 1}`}
                  disabled={hole.par <= MIN_PAR}
                  onClick={() => updateHole(index, { par: hole.par - 1 })}
                >
                  −
                </button>
                <span>Par {hole.par}</span>
                <button
                  type="button"
                  aria-label={`Raise par for hole ${index + 1}`}
                  disabled={hole.par >= MAX_PAR}
                  onClick={() => updateHole(index, { par: hole.par + 1 })}
                >
                  +
                </button>
              </div>
              <label>
                Feet
                <input
                  inputMode="numeric"
                  value={hole.distance}
                  onChange={(event) => updateHole(index, { distance: event.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={save}>
            Save course
          </button>
        </div>
      </div>
      </section>
  );
}
