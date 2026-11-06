import { useState } from "react";
import { Link } from "react-router-dom";
import { StartRoundDialog } from "../components/StartRoundDialog";
import { VsPar } from "../components/VsPar";
import { formatLocation, runningTotal } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";
import type { Course } from "../types";

export function PlayPage() {
  useTitle("Play");
  const { courses, rounds } = useStore();
  const [starting, setStarting] = useState<Course | null>(null);
  const active = rounds.filter((round) => round.finishedAt == null);

  return (
    <section className="page">
      <p className="eyebrow">Tee off</p>
      <h1>Play</h1>
      <p className="lede">Pick a course and keep score one hole at a time.</p>
      {active.length > 0 && (
        <div className="stack">
          <h2>Resume</h2>
          {active.map((round) => {
            const lead = round.players[0];
            const total = lead ? runningTotal(round.holes, lead.scores) : null;
            return (
              <Link key={round.id} className="paper link-card" to={`/play/${round.id}`}>
                <span className="card-kicker">Hole {round.currentHole}</span>
                <strong>{round.courseName}</strong>
                <span className="muted">
                  {round.players.map((player) => player.name).join(", ")}
                </span>
                {total && (
                  <span className="card-score">
                    {total.scored > 0 ? total.strokes : "–"} <VsPar diff={total.diff} scored={total.scored > 0} />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <div className="stack">
        <h2>Courses</h2>
        {courses.length === 0 && (
          <p className="muted">
            Add a course before you start. <Link to="/courses/new">New course</Link>
          </p>
        )}
        {courses.map((course) => (
          <article key={course.id} className="list-row static">
            <span>
              <strong>{course.name}</strong>
              <span className="muted">
                {formatLocation(course.city, course.region)} · {course.holes.length} holes
              </span>
            </span>
            <button type="button" className="btn btn-primary" onClick={() => setStarting(course)}>
              Start
            </button>
          </article>
        ))}
      </div>
      {starting && <StartRoundDialog course={starting} onClose={() => setStarting(null)} />}
    </section>
  );
}
