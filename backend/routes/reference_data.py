"""
routes/reference_data.py – CRUD endpoints for DB-managed dropdown lists.

GET  /api/reference-data              → { list_name: [values] }
POST /api/reference-data              → add a new value to a list
PATCH /api/reference-data/{id}        → rename / reorder / toggle active
DELETE /api/reference-data/{id}       → remove a value
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import require_admin, require_editor
from database import get_db
from models_db import DBReferenceData

router = APIRouter(prefix="/api", tags=["reference-data"])

# ---------------------------------------------------------------------------
# Seed data (all hardcoded lists currently in the frontend)
# ---------------------------------------------------------------------------

_SEED: dict[str, list[str]] = {
    "credential_type": [
        "Password", "OTP-Only", "API Key", "OAuth2", "Database",
        "SSH", "License Key", "Certificate", "Identity / SSO", "Custom",
    ],
    "status": ["Active", "Inactive", "Expired", "Compromised", "Archived"],
    "priority": ["Critical", "High", "Medium", "Low"],
    "environment": ["Production", "Staging", "Development", "Testing", "DR"],
    "protocol": [
        "HTTPS", "HTTP", "SFTP", "FTP", "SSH", "RDP",
        "MySQL", "PostgreSQL", "MSSQL", "Other",
    ],
    "billing_cycle": ["Monthly", "Annual", "Quarterly", "Bi-Annual", "One-Time"],
    "auto_renewal": ["Yes", "No", "Unknown"],
    "mfa_type": [
        "TOTP", "SMS", "Email", "Hardware Key",
        "Passkey", "Push", "Biometric", "Other",
    ],
    "access_level": [
        "Admin", "Owner", "Member", "Viewer", "Read-Only", "Service Account",
    ],
}


def seed_reference_data(db: Session) -> None:
    """Idempotently insert seed rows — skips any list_name/value combo that already exists."""
    for list_name, values in _SEED.items():
        for i, value in enumerate(values):
            exists = (
                db.query(DBReferenceData)
                .filter(
                    DBReferenceData.list_name == list_name,
                    DBReferenceData.value == value,
                )
                .first()
            )
            if not exists:
                db.add(DBReferenceData(
                    list_name=list_name,
                    value=value,
                    sort_order=i,
                    is_active=True,
                    needs_sync=False,
                ))
    db.commit()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class RefDataItem(BaseModel):
    id: int
    list_name: str
    value: str
    sort_order: int
    is_active: bool

    class Config:
        from_attributes = True


class CreateRefDataRequest(BaseModel):
    list_name: str
    value: str
    sort_order: Optional[int] = 0


class UpdateRefDataRequest(BaseModel):
    value: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/reference-data")
def get_reference_data(db: Session = Depends(get_db)) -> dict[str, list[str]]:
    """Return all active reference data grouped by list_name, sorted by sort_order."""
    rows = (
        db.query(DBReferenceData)
        .filter(DBReferenceData.is_active == True)  # noqa: E712
        .order_by(DBReferenceData.list_name, DBReferenceData.sort_order, DBReferenceData.value)
        .all()
    )
    result: dict[str, list[str]] = {}
    for row in rows:
        result.setdefault(row.list_name, []).append(row.value)
    return result


@router.get("/reference-data/all")
def get_reference_data_all(db: Session = Depends(get_db)) -> list[RefDataItem]:
    """Return all reference data rows (including inactive) for management UI."""
    rows = (
        db.query(DBReferenceData)
        .order_by(DBReferenceData.list_name, DBReferenceData.sort_order, DBReferenceData.value)
        .all()
    )
    return [RefDataItem.model_validate(r) for r in rows]


@router.post("/reference-data", response_model=RefDataItem)
def create_ref_data(
    body: CreateRefDataRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
) -> RefDataItem:
    existing = (
        db.query(DBReferenceData)
        .filter(
            DBReferenceData.list_name == body.list_name,
            DBReferenceData.value == body.value,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Value already exists in this list.")
    row = DBReferenceData(
        list_name=body.list_name,
        value=body.value,
        sort_order=body.sort_order or 0,
        is_active=True,
        needs_sync=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return RefDataItem.model_validate(row)


@router.patch("/reference-data/{item_id}", response_model=RefDataItem)
def update_ref_data(
    item_id: int,
    body: UpdateRefDataRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
) -> RefDataItem:
    row = db.query(DBReferenceData).filter(DBReferenceData.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reference data item not found.")
    if body.value is not None:
        row.value = body.value
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    if body.is_active is not None:
        row.is_active = body.is_active
    row.needs_sync = True
    db.commit()
    db.refresh(row)
    return RefDataItem.model_validate(row)


@router.delete("/reference-data/{item_id}", status_code=204)
def delete_ref_data(
    item_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_admin),
) -> None:
    row = db.query(DBReferenceData).filter(DBReferenceData.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Reference data item not found.")
    db.delete(row)
    db.commit()
