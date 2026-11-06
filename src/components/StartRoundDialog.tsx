import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store-context";
import type { Course } from "../types";

export function StartRoundDialog({ course, onClose }: { course: Course; onClose: () => void }) {
  const { startRound } = useStore();
  const navigate = useNavigate();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [players, setPlayers] = useState<string[]>(["You"]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addPlayer() {
    const name = draft.trim();
    if (!name) return;
    if (players.some((player) => player.toLowerCase() === name.toLowerCase())) {
      setError("That player is already on the card.");
      return;
    }
    if (players.length >= 8) {
      setError("A card holds up to 8 players.");
      return;
    }
    setPlayers((current) => [...current, name]);
    setDraft("");
    setError("");
  }

  function begin() {
    const result = startRound(course.id, players);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(`/play/${result.value.roundId}`);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">New round</p>
        <h2 id={titleId}>{course.name}</h2>
        <p className="muted">Who’s playing?</p>
        <ul className="player-picks">
          {players.map((name) => (
            <li key={name}>
              <span>{name}</span>
              {players.length > 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setPlayers((current) => current.filter((player) => player !== name))}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="inline-add"
          onSubmit={(event) => {
            event.preventDefault();
            addPlayer();
          }}
        >
          <label htmlFor="player-name">Add player</label>
          <div className="inline-fields">
            <input
              id="player-name"
              ref={inputRef}
              value={draft}
              maxLength={24}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Name"
            />
            <button type="submit" className="btn btn-secondary">
              Add
            </button>
          </div>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={begin}>
            Start round
          </button>
        </div>
      </div>
    </div>
  );
}
