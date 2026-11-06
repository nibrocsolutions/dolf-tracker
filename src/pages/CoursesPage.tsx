import { useState } from "react";
import { Link } from "react-router-dom";
import { StartRoundDialog } from "../components/StartRoundDialog";
import { formatFeet, formatLocation, totalDistance, totalPar } from "../lib/scoring";
import { courseMatches } from "../lib/store";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";
import type { Course } from "../types";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="star">
      <path
        d="m12 3.6 2.4 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.2 6.9 19l1.1-5.6L3.8 9.5l5.7-.7L12 3.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoursesPage() {
  useTitle("Courses");
  const { courses, toggleFavorite } = useStore();
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState<Course | null>(null);
  const visible = courses.filter((course) => courseMatches(course, query));

  return (
    <section className="page">
      <div className="section-head">
        <div>
          <p className="eyebrow">Course bag</p>
          <h1>Courses</h1>
        </div>
        <Link className="btn btn-primary" to="/courses/new">
          New course
        </Link>
      </div>
      <label className="search">
        <span>Search courses</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or town" />
      </label>
      {visible.length === 0 && (
        <p className="muted">{courses.length === 0 ? "Add the courses you play." : "No course matches that."}</p>
      )}
      <div className="stack">
        {visible.map((course) => (
          <article key={course.id} className="course-card">
            <Link className="course-card-main" to={`/courses/${course.id}`}>
              <span className="card-kicker">
                {course.favorite ? "Favorite" : "Course"}
                {course.sample ? " · Sample layout" : ""}
              </span>
              <strong>{course.name}</strong>
              <span className="muted">{formatLocation(course.city, course.region)}</span>
              <span className="muted">
                {course.holes.length} holes · Par {totalPar(course.holes)} · {formatFeet(totalDistance(course.holes))}
              </span>
            </Link>
            <div className="card-actions">
              <button
                type="button"
                className={course.favorite ? "icon-button on" : "icon-button"}
                aria-pressed={course.favorite}
                aria-label={course.favorite ? `Unfavorite ${course.name}` : `Favorite ${course.name}`}
                onClick={() => toggleFavorite(course.id)}
              >
                <Star filled={course.favorite} />
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setStarting(course)}>
                Start
              </button>
            </div>
          </article>
        ))}
      </div>
      {starting && <StartRoundDialog course={starting} onClose={() => setStarting(null)} />}
    </section>
  );
}
