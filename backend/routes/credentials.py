"""
routes/credentials.py – CRUD endpoints for credentials.
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

import crypto
from auth import UserInfo, get_current_user, require_editor, require_viewer, require_admin
from database import get_db
from models import (
    CredentialResponse,
    CredentialsPage,
    CreateCredentialRequest,
    UpdateCredentialRequest,
)
from models_db import DBChangeLog, DBCredential

router = APIRouter(prefix="/api", tags=["credentials"])

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_PLAIN_TO_ENC = {
    "password": "password_enc",
    "api_key": "api_key_enc",
    "api_secret": "api_secret_enc",
    "client_secret": "client_secret_enc",
}


def _to_response(db_cred: DBCredential) -> CredentialResponse:
    """Convert a DBCredential ORM row to a CredentialResponse (no secrets)."""
    excluded = {
        "id", "password_enc", "api_key_enc", "api_secret_enc", "client_secret_enc",
        "needs_sync", "authorized_users_json", "mfa_methods_json",
    }
    data = {
        col: getattr(db_cred, col)
        for col in db_cred.__table__.columns.keys()
        if col not in excluded
    }
    data["has_password"] = bool(db_cred.password_enc)
    data["has_api_key"] = bool(db_cred.api_key_enc)
    data["has_api_secret"] = bool(db_cred.api_secret_enc)
    data["has_client_secret"] = bool(db_cred.client_secret_enc)
    # Map JSON text columns to parsed lists
    data["authorized_users"] = db_cred.authorized_users_json or "[]"
    data["mfa_methods"] = db_cred.mfa_methods_json or "[]"
    return CredentialResponse(**data)


def _next_credential_id(db: Session) -> str:
    """Return the next CRED-YYYY-NNNN identifier."""
    year = datetime.now(timezone.utc).year
    prefix = f"CRED-{year}-"
    row = (
        db.query(DBCredential.credential_id)
        .filter(DBCredential.credential_id.like(f"{prefix}%"))
        .order_by(DBCredential.credential_id.desc())
        .first()
    )
    if row:
        try:
            last_num = int(row[0].split("-")[-1])
        except (ValueError, IndexError):
            last_num = 0
        return f"{prefix}{last_num + 1:04d}"
    return f"{prefix}0001"


def _log_action(
    db: Session,
    cred: DBCredential,
    action: str,
    field_changed: str = "",
    old_val: str = "",
    new_val: str = "",
    changed_by: str = "System",
    changed_by_email: str = "",
    reason: str = "",
) -> None:
    """Insert a DBChangeLog entry for an action on *cred*."""
    log = DBChangeLog(
        log_id=str(uuid.uuid4()),
        timestamp=datetime.now(timezone.utc).isoformat(),
        credential_id=cred.credential_id,
        tenant_code=cred.tenant_code or "",
        tenant_name=cred.tenant_name or "",
        service_name=cred.service_name or "",
        action=action,
        field_changed=field_changed,
        old_value_masked=old_val,
        new_value_masked=new_val,
        changed_by=changed_by,
        changed_by_email=changed_by_email,
        reason=reason,
        needs_sync=True,
    )
    db.add(log)


# ---------------------------------------------------------------------------
# Request body for log-access
# ---------------------------------------------------------------------------

class LogAccessBody(BaseModel):
    accessed_by: str = "System"
    reason: str = ""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/credentials", response_model=CredentialsPage)
def list_credentials(
    q: Optional[str] = Query(None, description="Search service_name / tenant / username / tags"),
    tenant: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: UserInfo = Depends(require_viewer),
) -> CredentialsPage:
    query = db.query(DBCredential).filter(DBCredential.record_status == "Active")

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                DBCredential.service_name.ilike(like),
                DBCredential.tenant_name.ilike(like),
                DBCredential.tenant_code.ilike(like),
                DBCredential.username_email.ilike(like),
                DBCredential.tags.ilike(like),
                DBCredential.credential_id.ilike(like),
            )
        )
    if tenant:
        query = query.filter(DBCredential.tenant_code == tenant)
    if category:
        query = query.filter(DBCredential.category == category)
    if status:
        query = query.filter(DBCredential.status == status)
    if priority:
        query = query.filter(DBCredential.priority == priority)

    total = query.count()
    pages = max(1, math.ceil(total / page_size))
    items_db = query.offset((page - 1) * page_size).limit(page_size).all()

    return CredentialsPage(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=[_to_response(c) for c in items_db],
    )


@router.get("/credential/{credential_id}", response_model=CredentialResponse)
def get_credential(
    credential_id: str,
    db: Session = Depends(get_db),
    _user: UserInfo = Depends(require_viewer),
) -> CredentialResponse:
    cred = db.query(DBCredential).filter(
        DBCredential.credential_id == credential_id
    ).first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential '{credential_id}' not found.")
    return _to_response(cred)


@router.post("/credential/create", response_model=CredentialResponse, status_code=201)
def create_credential(
    body: CreateCredentialRequest,
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_editor),
) -> CredentialResponse:
    now_str = datetime.now(timezone.utc).isoformat()

    # If authenticated, override created_by / last_updated_by with real identity
    actor      = user.display_name if user else (body.created_by or "System")
    actor_email = user.email if user else ""

    # Accept an explicit credential_id if supplied in the body via extra fields
    # (CreateCredentialRequest doesn't declare it but callers may pass it)
    cred_id: Optional[str] = getattr(body, "credential_id", None)
    if not cred_id:
        cred_id = _next_credential_id(db)

    # Check for duplicate
    if db.query(DBCredential).filter(DBCredential.credential_id == cred_id).first():
        raise HTTPException(status_code=409, detail=f"Credential '{cred_id}' already exists.")

    cred = DBCredential(
        credential_id=cred_id,
        tenant_code=body.tenant_code or "",
        tenant_name=body.tenant_name or "",
        category=body.category or "",
        subcategory=body.subcategory or "",
        service_name=body.service_name or "",
        service_url=body.service_url or "",
        environment=body.environment or "",
        status=body.status or "Active",
        priority=body.priority or "Medium",
        username_email=body.username_email or "",
        password_enc=crypto.encrypt(body.password),
        api_key_enc=crypto.encrypt(body.api_key),
        api_secret_enc=crypto.encrypt(body.api_secret),
        client_secret_enc=crypto.encrypt(body.client_secret),
        recovery_email=body.recovery_email or "",
        recovery_phone=body.recovery_phone or "",
        mfa_enabled=body.mfa_enabled or "No",
        mfa_type=body.mfa_type or "",
        mfa_app_name=body.mfa_app_name or "",
        backup_codes_location=body.backup_codes_location or "",
        security_notes=body.security_notes or "",
        account_display_name=body.account_display_name or "",
        account_id=body.account_id or "",
        license_type=body.license_type or "",
        plan_tier=body.plan_tier or "",
        subscription_start=body.subscription_start or "",
        subscription_end=body.subscription_end or "",
        auto_renewal=body.auto_renewal or "",
        monthly_cost=body.monthly_cost or 0.0,
        billing_cycle=body.billing_cycle or "",
        billing_email=body.billing_email or "",
        payment_reference=body.payment_reference or "",
        access_level=body.access_level or "",
        linked_credential_id=body.linked_credential_id or "",
        client_id=body.client_id or "",
        tenant_id_app=body.tenant_id_app or "",
        subscription_id_azure=body.subscription_id_azure or "",
        server_hostname=body.server_hostname or "",
        port=body.port or "",
        protocol=body.protocol or "",
        database_name=body.database_name or "",
        managed_by=body.managed_by or "",
        managed_by_email=body.managed_by_email or actor_email,
        created_by=actor,
        created_date=body.created_date or now_str[:10],
        last_updated_by=actor,
        last_updated_date=now_str[:10],
        last_verified_date=body.last_verified_date or "",
        last_password_changed=body.last_password_changed or "",
        password_expiry_date=body.password_expiry_date or "",
        next_review_date=body.next_review_date or "",
        credential_type=body.credential_type or "Password",
        authorized_users_json=json.dumps(body.authorized_users or []),
        mfa_methods_json=json.dumps(body.mfa_methods or []),
        tags=body.tags or "",
        notes=body.notes or "",
        record_status=body.record_status or "Active",
        needs_sync=True,
    )
    db.add(cred)
    db.flush()
    _log_action(db, cred, "Created", changed_by=actor, changed_by_email=actor_email)
    db.commit()
    db.refresh(cred)
    return _to_response(cred)


@router.post("/credential/update/{credential_id}", response_model=CredentialResponse)
def update_credential(
    credential_id: str,
    body: UpdateCredentialRequest,
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_editor),
) -> CredentialResponse:
    cred = db.query(DBCredential).filter(
        DBCredential.credential_id == credential_id
    ).first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential '{credential_id}' not found.")

    now_str = datetime.now(timezone.utc).isoformat()

    # Plain (non-sensitive) fields
    plain_fields = [
        "tenant_code", "tenant_name", "category", "subcategory", "service_name",
        "service_url", "environment", "status", "priority", "username_email",
        "recovery_email", "recovery_phone", "mfa_enabled", "mfa_type", "mfa_app_name",
        "backup_codes_location", "security_notes", "account_display_name", "account_id",
        "license_type", "plan_tier", "subscription_start", "subscription_end",
        "auto_renewal", "monthly_cost", "billing_cycle", "billing_email",
        "payment_reference", "access_level", "linked_credential_id", "client_id",
        "tenant_id_app", "subscription_id_azure", "server_hostname", "port", "protocol",
        "database_name", "managed_by", "managed_by_email", "last_updated_by",
        "last_verified_date", "last_password_changed", "password_expiry_date",
        "next_review_date", "credential_type", "tags", "notes", "record_status",
    ]

    changed_fields: list[str] = []
    for field in plain_fields:
        new_val = getattr(body, field, None)
        if new_val is None:
            continue
        old_val = getattr(cred, field, None)
        if str(old_val) != str(new_val):
            changed_fields.append(field)
            setattr(cred, field, new_val)

    # JSON list fields
    new_authorized = json.dumps(body.authorized_users or [])
    if new_authorized != (cred.authorized_users_json or "[]"):
        changed_fields.append("authorized_users")
        cred.authorized_users_json = new_authorized

    new_mfa = json.dumps(body.mfa_methods or [])
    if new_mfa != (cred.mfa_methods_json or "[]"):
        changed_fields.append("mfa_methods")
        cred.mfa_methods_json = new_mfa

    # Sensitive fields – only re-encrypt if the caller provided a non-empty value
    sensitive_map = {
        "password": "password_enc",
        "api_key": "api_key_enc",
        "api_secret": "api_secret_enc",
        "client_secret": "client_secret_enc",
    }
    for plain, enc in sensitive_map.items():
        plain_val = getattr(body, plain, "") or ""
        if plain_val:
            changed_fields.append(plain)
            setattr(cred, enc, crypto.encrypt(plain_val))

    cred.last_updated_date = now_str[:10]
    cred.needs_sync = True

    actor       = user.display_name if user else (body.last_updated_by or "System")
    actor_email = user.email        if user else ""

    if changed_fields:
        _log_action(
            db,
            cred,
            "Updated",
            field_changed=", ".join(changed_fields),
            changed_by=actor,
            changed_by_email=actor_email,
        )

    db.commit()
    db.refresh(cred)
    return _to_response(cred)


@router.post("/credential/archive/{credential_id}", response_model=CredentialResponse)
def archive_credential(
    credential_id: str,
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_admin),
) -> CredentialResponse:
    cred = db.query(DBCredential).filter(
        DBCredential.credential_id == credential_id
    ).first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential '{credential_id}' not found.")

    actor       = user.display_name if user else "System"
    actor_email = user.email        if user else ""

    cred.record_status = "Archived"
    cred.status = "Archived"
    cred.needs_sync = True
    _log_action(db, cred, "Archived", changed_by=actor, changed_by_email=actor_email)
    db.commit()
    db.refresh(cred)
    return _to_response(cred)


@router.get("/suggestions")
def get_suggestions(
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_viewer),
) -> dict:
    """Return unique non-empty field values for frontend autocomplete."""
    from sqlalchemy import distinct
    def _unique(col):
        return sorted({
            r[0] for r in db.query(distinct(col)).filter(col != "").all()
            if r[0]
        })
    return {
        "service_names": _unique(DBCredential.service_name),
        "service_urls":  _unique(DBCredential.service_url),
        "usernames":     _unique(DBCredential.username_email),
    }


@router.get("/credential/{credential_id}/reveal/{field}")
def reveal_field(
    credential_id: str,
    field: str,
    accessed_by: str = Query("System"),
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_viewer),
) -> dict:
    allowed_fields = {"password", "api_key", "api_secret", "client_secret"}
    if field not in allowed_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Field '{field}' cannot be revealed. Allowed: {sorted(allowed_fields)}",
        )

    cred = db.query(DBCredential).filter(
        DBCredential.credential_id == credential_id
    ).first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential '{credential_id}' not found.")

    enc_field = _PLAIN_TO_ENC[field]
    encrypted_val = getattr(cred, enc_field, "") or ""
    decrypted = crypto.decrypt(encrypted_val)

    actor       = user.display_name if user else accessed_by
    actor_email = user.email        if user else ""

    # Deduplicate: skip logging if the same user revealed this field within the last 5 minutes
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    already_logged = (
        db.query(DBChangeLog)
        .filter(
            DBChangeLog.credential_id == credential_id,
            DBChangeLog.action == "REVEAL",
            DBChangeLog.field_changed == field,
            DBChangeLog.changed_by == actor,
            DBChangeLog.timestamp >= cutoff,
        )
        .first()
    )
    if not already_logged:
        _log_action(db, cred, "REVEAL", field_changed=field, changed_by=actor, changed_by_email=actor_email)
        db.commit()

    return {"value": decrypted}


@router.post("/credential/{credential_id}/log-access")
def log_access(
    credential_id: str,
    body: LogAccessBody,
    db: Session = Depends(get_db),
    user: UserInfo = Depends(require_viewer),
) -> dict:
    cred = db.query(DBCredential).filter(
        DBCredential.credential_id == credential_id
    ).first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential '{credential_id}' not found.")

    actor       = user.display_name if user else body.accessed_by
    actor_email = user.email        if user else ""

    _log_action(
        db,
        cred,
        "Accessed",
        changed_by=actor,
        changed_by_email=actor_email,
        reason=body.reason,
    )
    db.commit()
    return {"status": "logged"}
