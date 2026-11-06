import { Link } from "react-router-dom";
import { VsPar } from "../components/VsPar";
import { formatLocation, formatWhen, runningTotal } from "../lib/scoring";
import { careerStats, playerNames } from "../lib/stats";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function HomePage() {
  useTitle("Dolf");
  const { rounds } = useStore();
  const active = rounds.filter((round) => round.finishedAt == null);
  const recent = rounds.filter((round) => round.finishedAt).slice(0, 4);
  const names = playerNames(rounds);
  const statsName = names.includes("You") ? "You" : (names[0] ?? "You");
  const stats = careerStats(rounds, statsName);

  return (
    <section className="page">
      <p className="eyebrow">On the tee</p>
      <h1>Keep the card.</h1>
      <p className="lede">Courses, hole-by-hole scores, and how your rounds add up.</p>
      <Link className="btn btn-primary btn-large" to="/play">
        Start a round
      </Link>

      {active.length > 0 && (
        <div className="stack">
          <h2>In progress</h2>
          {active.map((round) => {
            const you = round.players[0];
            const total = you ? runningTotal(round.holes, you.scores) : null;
            return (
              <Link key={round.id} className="paper link-card" to={`/play/${round.id}`}>
                <span className="card-kicker">Resume · Hole {round.currentHole}</span>
                <strong>{round.courseName}</strong>
                <span className="muted">{formatLocation(round.city, round.region)}</span>
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

      <dl className="stat-row">
        <div>
          <dt>Rounds</dt>
          <dd>{stats.rounds}</dd>
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

      <div className="stack">
        <div className="section-head">
          <h2>Recent rounds</h2>
          <Link to="/rounds">All rounds</Link>
        </div>
        {recent.length === 0 && <p className="muted">Finished rounds land here.</p>}
        {recent.map((round) => {
          const you = round.players.find((player) => player.name.toLowerCase() === "you") ?? round.players[0];
          const total = you ? runningTotal(round.holes, you.scores) : null;
          return (
            <Link key={round.id} className="list-row" to={`/rounds/${round.id}`}>
              <span>
                <strong>{round.courseName}</strong>
                <span className="muted">{round.finishedAt ? formatWhen(round.finishedAt) : ""}</span>
              </span>
              {total && you && (
                <span className="card-score">
                  {you.name} {total.strokes} <VsPar diff={total.diff} />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
