import { Link } from "react-router-dom";
import { VsPar } from "../components/VsPar";
import { formatWhen, runningTotal } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function RoundsPage() {
  useTitle("Rounds");
  const { rounds } = useStore();
  const active = rounds.filter((round) => round.finishedAt == null);
  const finished = rounds.filter((round) => round.finishedAt);

  return (
    <section className="page">
      <p className="eyebrow">Scorecards</p>
      <h1>Rounds</h1>
      {rounds.length === 0 && (
        <p className="lede">
          No rounds yet. <Link to="/play">Start one</Link>.
        </p>
      )}
      {active.length > 0 && (
        <div className="stack">
          <h2>In progress</h2>
          {active.map((round) => (
            <Link key={round.id} className="list-row" to={`/play/${round.id}`}>
              <span>
                <strong>{round.courseName}</strong>
                <span className="muted">Hole {round.currentHole} · {formatWhen(round.startedAt)}</span>
              </span>
              <span>Resume</span>
            </Link>
          ))}
        </div>
      )}
      {finished.length > 0 && (
        <div className="stack">
          <h2>Finished</h2>
          {finished.map((round) => {
            const lead = round.players[0];
            const total = lead ? runningTotal(round.holes, lead.scores) : null;
            return (
              <Link key={round.id} className="list-row" to={`/rounds/${round.id}`}>
                <span>
                  <strong>{round.courseName}</strong>
                  <span className="muted">
                    {round.finishedAt ? formatWhen(round.finishedAt) : ""} · {round.players.map((player) => player.name).join(", ")}
                  </span>
                </span>
                {total && (
                  <span className="card-score">
                    {total.strokes} <VsPar diff={total.diff} />
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
