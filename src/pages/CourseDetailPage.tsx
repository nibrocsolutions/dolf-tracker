import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmBar } from "../components/ConfirmBar";
import { NotFound } from "../components/NotFound";
import { StartRoundDialog } from "../components/StartRoundDialog";
import { formatFeet, formatLocation, totalDistance, totalPar } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function CourseDetailPage() {
  const { courseId } = useParams();
  const { courses, deleteCourse } = useStore();
  const navigate = useNavigate();
  const course = courses.find((item) => item.id === courseId);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useTitle(course?.name ?? "Course");

  if (!course) return <NotFound />;

  return (
    <section className="page">
      <p className="eyebrow">{course.sample ? "Sample layout" : "Course"}</p>
      <h1>{course.name}</h1>
      <p className="lede">{formatLocation(course.city, course.region)}</p>
      <p className="muted">
        {course.holes.length} holes · Par {totalPar(course.holes)} · {formatFeet(totalDistance(course.holes))}
      </p>
      {course.sample && (
        <p className="note">Sample layout with made-up hole data. Edit the numbers, or add the course you actually play.</p>
      )}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={() => setStarting(true)}>
          Start round
        </button>
        <Link className="btn btn-secondary" to={`/courses/${course.id}/edit`}>
          Edit course
        </Link>
      </div>
      <div className="paper">
        <table className="holes">
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col">Par</th>
              <th scope="col">Distance</th>
            </tr>
          </thead>
          <tbody>
            {course.holes.map((hole) => (
              <tr key={hole.number}>
                <td>{hole.number}</td>
                <td>{hole.par}</td>
                <td>{formatFeet(hole.distanceFt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirming ? (
        <ConfirmBar
          danger
          message="This removes the course. Saved rounds keep their scorecards."
          confirmLabel="Delete course"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            const result = deleteCourse(course.id);
            if (result.ok) navigate("/courses");
          }}
        />
      ) : (
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          Delete course
        </button>
      )}
      {starting && <StartRoundDialog course={course} onClose={() => setStarting(false)} />}
    </section>
  );
}
