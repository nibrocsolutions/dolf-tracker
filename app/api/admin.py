from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.backup import BackupError, export_backup, remove_player_and_scores, restore_backup, summary
from app.database import get_db
from app.queries import player_or_404

router = APIRouter(prefix="/api/admin")


@router.get("/summary")
def admin_summary(db: Session = Depends(get_db)) -> dict:
    return summary(db)


@router.get("/export")
def admin_export(db: Session = Depends(get_db)) -> dict:
    return export_backup(db)


@router.post("/import")
def admin_import(payload: dict, db: Session = Depends(get_db)) -> dict:
    try:
        return restore_backup(db, payload)
    except BackupError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/players/{player_id}", status_code=204)
def admin_delete_player(player_id: int, db: Session = Depends(get_db)) -> Response:
    player = player_or_404(db, player_id)
    remove_player_and_scores(db, player)
    return Response(status_code=204)
