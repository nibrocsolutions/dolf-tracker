import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmBar } from "../components/ConfirmBar";
import { NotFound } from "../components/NotFound";
import { VsPar } from "../components/VsPar";
import { formatLocation, formatWhen, resultBucket, runningTotal, scoreClass } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function RoundDetailPage() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { rounds, deleteRound } = useStore();
  const round = rounds.find((item) => item.id === roundId);
  const [confirming, setConfirming] = useState(false);
  useTitle(round ? round.courseName : "Round");

  if (!round) return <NotFound />;

  return (
    <section className="page">
      <p className="eyebrow">{round.finishedAt ? formatWhen(round.finishedAt) : "In progress"}</p>
      <h1>{round.courseName}</h1>
      <p className="lede">{formatLocation(round.city, round.region)}</p>
      <div className="hero-scores">
        {round.players.map((player) => {
          const total = runningTotal(round.holes, player.scores);
          return (
            <article key={player.id} className="paper hero-score">
              <span className="muted">{player.name}</span>
              <strong>{total.scored > 0 ? total.strokes : "–"}</strong>
              <VsPar diff={total.diff} scored={total.scored === round.holes.length} />
            </article>
          );
        })}
      </div>
      <div className="paper table-wrap">
        <table className="holes score-grid">
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col">Par</th>
              {round.players.map((player) => (
                <th scope="col" key={player.id}>
                  {player.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {round.holes.map((hole, index) => (
              <tr key={hole.number}>
                <td>{hole.number}</td>
                <td>{hole.par}</td>
                {round.players.map((player) => {
                  const score = player.scores[index];
                  const value = typeof score === "number" ? score : null;
                  return (
                    <td key={player.id} className={value == null ? "" : `cell-${resultBucket(value, hole.par)}`}>
                      <span className={scoreClass(value, hole.par)}>{value ?? "–"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              {round.players.map((player) => {
                const total = runningTotal(round.holes, player.scores);
                return (
                  <td key={player.id}>
                    {total.scored > 0 ? total.strokes : "–"} <VsPar diff={total.diff} scored={total.scored > 0} />
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="row-actions">
        <Link className="btn btn-primary" to={`/play/${round.id}`}>
          {round.finishedAt ? "Edit scores" : "Resume round"}
        </Link>
      </div>
      {confirming ? (
        <ConfirmBar
          danger
          message="Delete this scorecard? This stays on this device only, so there is no undo."
          confirmLabel="Delete round"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            const result = deleteRound(round.id);
            if (result.ok) navigate("/rounds");
          }}
        />
      ) : (
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          Delete round
        </button>
      )}
    </section>
  );
}
