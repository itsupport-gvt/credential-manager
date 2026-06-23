"""
routes/users.py – Auth user endpoints + Staff directory CRUD.

GET  /api/auth/me                   – current user identity + role
GET  /api/auth/users                – list Entra sign-in users (Admin only)
PATCH /api/auth/users/{oid}/status  – enable/disable a user (Admin only)

GET    /api/users        – list staff directory
POST   /api/users        – create staff user
PATCH  /api/users/{id}   – update staff user
DELETE /api/users/{id}   – delete staff user
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import AUTH_ENABLED, ALL_ROLES, UserInfo, get_current_user, get_optional_user, require_admin, require_editor
from database import get_db
from models_db import DBAuthUser, DBUser

router = APIRouter(prefix="/api/auth", tags=["auth"])
staff_router = APIRouter(prefix="/api", tags=["users"])


# ---------------------------------------------------------------------------
# Response model
# ---------------------------------------------------------------------------

class AuthUserOut(BaseModel):
    oid: str
    name: str
    email: str
    entra_roles: List[str]
    effective_role: str
    is_active: bool
    last_login: str
    created_at: str

    class Config:
        from_attributes = True


def _row_to_out(row: DBAuthUser) -> AuthUserOut:
    try:
        roles = json.loads(row.entra_roles or "[]")
    except Exception:
        roles = []

    # Derive effective role from Entra roles list
    from auth import _resolve_role  # noqa: F811
    effective = _resolve_role(roles) or "None"

    return AuthUserOut(
        oid=row.oid,
        name=row.name or "",
        email=row.email or "",
        entra_roles=roles,
        effective_role=effective,
        is_active=bool(row.is_active),
        last_login=row.last_login or "",
        created_at=row.created_at or "",
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(
    user: Optional[UserInfo] = Depends(get_optional_user),
) -> dict:
    """Return auth_enabled flag and current user. Never raises — safe to call without a token."""
    return {
        "auth_enabled": AUTH_ENABLED,
        "user": {
            "oid":   user.oid,
            "name":  user.name,
            "email": user.email,
            "role":  user.role,
        } if user else None,
    }


@router.get("/users", response_model=List[AuthUserOut])
def list_auth_users(
    _admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> List[AuthUserOut]:
    """List every Microsoft account that has ever signed in (Admin only)."""
    rows = db.query(DBAuthUser).order_by(DBAuthUser.created_at.desc()).all()
    return [_row_to_out(r) for r in rows]


class UpdateStatusBody(BaseModel):
    is_active: bool


@router.patch("/users/{oid}/status")
def update_user_status(
    oid: str,
    body: UpdateStatusBody,
    admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuthUserOut:
    """Enable or disable a user account (Admin only). Cannot disable yourself."""
    if oid == admin.oid and not body.is_active:
        raise HTTPException(status_code=400, detail="Cannot disable your own account")
    row = db.query(DBAuthUser).filter(DBAuthUser.oid == oid).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    row.is_active = body.is_active
    db.commit()
    db.refresh(row)
    return _row_to_out(row)


# ---------------------------------------------------------------------------
# Staff directory (DBUser) – CRUD
# ---------------------------------------------------------------------------

class StaffUserOut(BaseModel):
    user_id: str
    full_name: str
    email: str
    role: str
    department: str
    access_level: str
    status: str
    notes: str

    class Config:
        from_attributes = True


class StaffUserBody(BaseModel):
    full_name: str = ""
    email: str
    role: str = ""
    department: str = ""
    access_level: str = ""
    status: str = "Active"
    notes: str = ""


def _user_to_out(row: DBUser) -> StaffUserOut:
    return StaffUserOut(
        user_id=row.user_id,
        full_name=row.full_name or "",
        email=row.email or "",
        role=row.role or "",
        department=row.department or "",
        access_level=row.access_level or "",
        status=row.status or "Active",
        notes=row.notes or "",
    )


@staff_router.get("/users", response_model=List[StaffUserOut])
def list_staff_users(
    _user: UserInfo = Depends(require_editor),
    db: Session = Depends(get_db),
) -> List[StaffUserOut]:
    rows = db.query(DBUser).order_by(DBUser.full_name).all()
    return [_user_to_out(r) for r in rows]


@staff_router.post("/users", response_model=StaffUserOut)
def create_staff_user(
    body: StaffUserBody,
    _admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    existing = db.query(DBUser).filter(DBUser.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    row = DBUser(
        user_id=f"USR-{str(uuid.uuid4())[:8].upper()}",
        full_name=body.full_name,
        email=body.email,
        role=body.role,
        department=body.department,
        access_level=body.access_level,
        status=body.status or "Active",
        notes=body.notes,
        needs_sync=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _user_to_out(row)


@staff_router.patch("/users/{user_id}", response_model=StaffUserOut)
def update_staff_user(
    user_id: str,
    body: StaffUserBody,
    _admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StaffUserOut:
    row = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    row.full_name    = body.full_name
    row.email        = body.email
    row.role         = body.role
    row.department   = body.department
    row.access_level = body.access_level
    row.status       = body.status or "Active"
    row.notes        = body.notes
    row.needs_sync   = True
    db.commit()
    db.refresh(row)
    return _user_to_out(row)


@staff_router.delete("/users/{user_id}", status_code=204)
def delete_staff_user(
    user_id: str,
    _admin: UserInfo = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    row = db.query(DBUser).filter(DBUser.user_id == user_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(row)
    db.commit()
