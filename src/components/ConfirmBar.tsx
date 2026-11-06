type ConfirmBarProps = {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
};

export function ConfirmBar({ message, confirmLabel, onConfirm, onCancel, danger = false }: ConfirmBarProps) {
  return (
    <div className="confirm" role="group" aria-label="Please confirm">
      <p>{message}</p>
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={danger ? "btn btn-danger" : "btn btn-primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
