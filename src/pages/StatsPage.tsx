import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmBar } from "../components/ConfirmBar";
import { VsPar } from "../components/VsPar";
import { BUCKETS, BUCKET_LABELS, formatWhen } from "../lib/scoring";
import { parseStore } from "../lib/store";
import { careerStats, playerNames } from "../lib/stats";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function StatsPage() {
  useTitle("Stats");
  const store = useStore();
  const names = playerNames(store.rounds);
  const [selected, setSelected] = useState("You");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const name = names.includes(selected) ? selected : (names[0] ?? "You");
  const stats = careerStats(store.rounds, name);

  function exportBackup() {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dolf-tracker.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page">
      <p className="eyebrow">Your game</p>
      <h1>Stats</h1>
      {names.length > 1 && (
        <label>
          Player
          <select value={name} onChange={(event) => setSelected(event.target.value)}>
            {names.map((player) => (
              <option key={player} value={player}>
                {player}
              </option>
            ))}
          </select>
        </label>
      )}
      <dl className="stat-grid">
        <div>
          <dt>Rounds</dt>
          <dd>{stats.rounds}</dd>
        </div>
        <div>
          <dt>Courses</dt>
          <dd>{stats.courses}</dd>
        </div>
        <div>
          <dt>Avg vs par</dt>
          <dd>{stats.avgDiff == null ? "–" : <VsPar diff={stats.avgDiff} average />}</dd>
        </div>
        <div>
          <dt>Under par</dt>
          <dd>{stats.underPar}</dd>
        </div>
      </dl>
      {stats.best && (
        <Link className="paper link-card" to={`/rounds/${stats.best.roundId}`}>
          <span className="card-kicker">Best round</span>
          <strong>
            <VsPar diff={stats.best.diff} /> at {stats.best.courseName}
          </strong>
          <span className="muted">
            {stats.best.strokes} strokes · {formatWhen(stats.best.finishedAt)}
          </span>
        </Link>
      )}
      {stats.holes > 0 && (
        <div className="stack">
          <h2>Scoring mix</h2>
          <div
            className="bar"
            role="img"
            aria-label={BUCKETS.map((bucket) => `${BUCKET_LABELS[bucket]} ${stats.buckets[bucket]}`).join(", ")}
          >
            {BUCKETS.map((bucket) =>
              stats.buckets[bucket] > 0 ? (
                <span key={bucket} className={`bar-${bucket}`} style={{ flexGrow: stats.buckets[bucket] }} />
              ) : null,
            )}
          </div>
          <ul className="legend">
            {BUCKETS.map((bucket) => (
              <li key={bucket}>
                <span className={`swatch bar-${bucket}`} />
                {BUCKET_LABELS[bucket]}
                <strong>{stats.buckets[bucket]}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {stats.byCourse.length > 0 && (
        <div className="stack">
          <h2>By course</h2>
          {stats.byCourse.map((course) => (
            <div key={course.courseId} className="list-row static">
              <span>
                <strong>{course.courseName}</strong>
                <span className="muted">
                  {course.rounds} {course.rounds === 1 ? "round" : "rounds"}
                </span>
              </span>
              <VsPar diff={course.avgDiff} average />
            </div>
          ))}
        </div>
      )}
      {stats.rounds === 0 && <p className="lede">Finish a round to see scoring stats.</p>}
      <div className="stack backup">
        <h2>On this device</h2>
        <p className="muted">Courses and scores stay in this browser. Export a backup before you clear site data.</p>
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={exportBackup}>
            Export backup
          </button>
          <label className="btn btn-secondary file-button">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setNotice("");
                setError("");
                void file.text().then((text) => {
                  if (!parseStore(JSON.parse(text))) {
                    setError("That file is not a Dolf Tracker backup.");
                    return;
                  }
                  setPending(text);
                }).catch(() => setError("That file is not a Dolf Tracker backup."));
              }}
            />
          </label>
        </div>
        {pending && (
          <ConfirmBar
            message="Replace all courses and rounds on this device with this backup?"
            confirmLabel="Import backup"
            onCancel={() => setPending(null)}
            onConfirm={() => {
              const fileText = pending;
              try {
                const parsed = parseStore(JSON.parse(fileText));
                if (!parsed) {
                  setError("That file is not a Dolf Tracker backup.");
                  setPending(null);
                  return;
                }
                store.replaceStore(parsed);
                setNotice("Backup imported.");
                setPending(null);
              } catch {
                setError("That file is not a Dolf Tracker backup.");
                setPending(null);
              }
            }}
          />
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
