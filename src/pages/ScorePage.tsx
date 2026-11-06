import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmBar } from "../components/ConfirmBar";
import { NotFound } from "../components/NotFound";
import { VsPar } from "../components/VsPar";
import { countMissing, formatFeet, nextScore, resultBucket, runningTotal, scoreClass } from "../lib/scoring";
import { useTitle } from "../lib/useTitle";
import { useStore } from "../store-context";

export function ScorePage() {
  const { roundId } = useParams();
  const navigate = useNavigate();
  const { rounds, setScore, setCurrentHole, addPlayer, removePlayer, finishRound } = useStore();
  const round = rounds.find((item) => item.id === roundId);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  useTitle(round ? round.courseName : "Round");

  const holePin = round ? `${round.id}:${round.currentHole}` : "";
  useEffect(() => {
    if (!holePin) return;
    const holeNumber = holePin.slice(holePin.lastIndexOf(":") + 1);
    document.getElementById(`hole-dot-${holeNumber}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [holePin]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!round) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") setCurrentHole(round.id, Math.min(round.holes.length, round.currentHole + 1));
      if (event.key === "ArrowLeft") setCurrentHole(round.id, Math.max(1, round.currentHole - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, setCurrentHole]);

  if (!round) return <NotFound />;

  const holeIndex = Math.min(Math.max(round.currentHole, 1), round.holes.length) - 1;
  const hole = round.holes[holeIndex];
  if (!hole) return <NotFound />;
  const missing = countMissing(round.holes.length, round.players);
  const finished = Boolean(round.finishedAt);

  function saveScore(playerId: string, strokes: number) {
    const result = setScore(round!.id, playerId, holeIndex, strokes);
    if (!result.ok) setError(result.error);
  }

  function finish(fillPar: boolean) {
    const result = finishRound(round!.id, fillPar);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/rounds/${round!.id}`);
  }

  return (
    <section className="page score-page">
      <div className="section-head">
        <div>
          <p className="eyebrow">{finished ? "Saved round" : "Live round"}</p>
          <h1>{round.courseName}</h1>
        </div>
        {finished ? (
          <Link className="btn btn-secondary" to={`/rounds/${round.id}`}>
            Scorecard
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => (missing === 0 ? finish(false) : setConfirming(true))}>
            Finish
          </button>
        )}
      </div>
      <div className="paper scorecard">
        <div className="hole-strip" aria-label="Holes">
          {round.holes.map((item, index) => {
            const lead = round.players[0]?.scores[index];
            const bucket = typeof lead === "number" ? resultBucket(lead, item.par) : "empty";
            return (
              <button
                key={item.number}
                id={`hole-dot-${item.number}`}
                type="button"
                className={index === holeIndex ? `hole-dot dot-${bucket} current` : `hole-dot dot-${bucket}`}
                aria-current={index === holeIndex ? "true" : undefined}
                aria-label={`Hole ${item.number}`}
                onClick={() => setCurrentHole(round.id, item.number)}
              >
                {item.number}
              </button>
            );
          })}
        </div>
        <p className="hole-kicker">
          Hole {hole.number} of {round.holes.length}
        </p>
        <h2>
          Par {hole.par}
          <span> · {formatFeet(hole.distanceFt)}</span>
        </h2>
        <ul className="running-line">
          {round.players.map((player) => {
            const total = runningTotal(round.holes, player.scores);
            return (
              <li key={player.id}>
                <span>{player.name}</span>
                <strong>{total.scored > 0 ? total.strokes : "–"}</strong>
                <VsPar diff={total.diff} scored={total.scored > 0} />
              </li>
            );
          })}
        </ul>
        <div className="player-scores">
          {round.players.map((player) => {
            const score = player.scores[holeIndex];
            const value = typeof score === "number" ? score : null;
            return (
              <div key={player.id} className="player-row">
                <div className="player-name">
                  <span>{player.name}</span>
                  {!finished && round.players.length > 1 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const result = removePlayer(round.id, player.id);
                        if (!result.ok) setError(result.error);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="stepper">
                  <button
                    type="button"
                    aria-label={`Lower ${player.name} on hole ${hole.number}`}
                    onClick={() => saveScore(player.id, nextScore(value, hole.par, -1))}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={scoreClass(value, hole.par)}
                    aria-label={`Set ${player.name} to par on hole ${hole.number}`}
                    onClick={() => saveScore(player.id, hole.par)}
                  >
                    {value ?? "–"}
                  </button>
                  <button
                    type="button"
                    aria-label={`Raise ${player.name} on hole ${hole.number}`}
                    onClick={() => saveScore(player.id, nextScore(value, hole.par, 1))}
                  >
                    +
                  </button>
                </div>
                <p className="score-hint">{value == null ? "− and + start from par. Tap the number for par." : <VsPar diff={value - hole.par} />}</p>
              </div>
            );
          })}
        </div>
        {!finished && (
          <form
            className="inline-add"
            onSubmit={(event) => {
              event.preventDefault();
              const result = addPlayer(round.id, draft);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setDraft("");
              setError("");
            }}
          >
            <label htmlFor="card-player">Add a player</label>
            <div className="inline-fields">
              <input id="card-player" value={draft} maxLength={24} onChange={(event) => setDraft(event.target.value)} placeholder="Name" />
              <button type="submit" className="btn btn-secondary">
                Add
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {confirming && (
          <ConfirmBar
            message={
              missing === 1
                ? "1 score is still open. Record it as par and save the round?"
                : `${missing} scores are still open. Record them as par and save the round?`
            }
            confirmLabel="Record as par and finish"
            onCancel={() => setConfirming(false)}
            onConfirm={() => finish(true)}
          />
        )}
        <div className="row-actions hole-nav">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={hole.number === 1}
            onClick={() => setCurrentHole(round.id, hole.number - 1)}
          >
            Previous
          </button>
          {hole.number < round.holes.length ? (
            <button type="button" className="btn btn-primary" onClick={() => setCurrentHole(round.id, hole.number + 1)}>
              Next hole
            </button>
          ) : finished ? (
            <Link className="btn btn-primary" to={`/rounds/${round.id}`}>
              Scorecard
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => (missing === 0 ? finish(false) : setConfirming(true))}>
              Finish round
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
