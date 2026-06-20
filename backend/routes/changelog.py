"""
routes/changelog.py – Change log query and CSV export endpoints.
"""

from __future__ import annotations

import csv
import io
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import ChangeLogItem, ChangeLogPage
from models_db import DBChangeLog

router = APIRouter(prefix="/api", tags=["changelog"])


def _to_item(row: DBChangeLog) -> ChangeLogItem:
    return ChangeLogItem(
        id=row.id,
        log_id=row.log_id,
        timestamp=row.timestamp,
        credential_id=row.credential_id,
        tenant_code=row.tenant_code,
        tenant_name=row.tenant_name,
        service_name=row.service_name,
        action=row.action,
        field_changed=row.field_changed,
        old_value_masked=row.old_value_masked,
        new_value_masked=row.new_value_masked,
        changed_by=row.changed_by,
        changed_by_email=row.changed_by_email,
        reason=row.reason,
        notes=row.notes,
        source_log_id=row.source_log_id,
    )


@router.get("/changelog", response_model=ChangeLogPage)
def list_changelog(
    credential_id: Optional[str] = Query(None),
    tenant: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search service_name or changed_by"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> ChangeLogPage:
    query = db.query(DBChangeLog).order_by(DBChangeLog.timestamp.desc())

    if credential_id:
        query = query.filter(DBChangeLog.credential_id == credential_id)
    if tenant:
        query = query.filter(DBChangeLog.tenant_code == tenant)
    if action:
        query = query.filter(DBChangeLog.action == action)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                DBChangeLog.service_name.ilike(like),
                DBChangeLog.changed_by.ilike(like),
                DBChangeLog.credential_id.ilike(like),
            )
        )

    total = query.count()
    pages = max(1, math.ceil(total / page_size))
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return ChangeLogPage(
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
        items=[_to_item(r) for r in rows],
    )


@router.get("/changelog/export")
def export_changelog(
    credential_id: Optional[str] = Query(None),
    tenant: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Stream the change log as a CSV download."""
    query = db.query(DBChangeLog).order_by(DBChangeLog.timestamp.desc())

    if credential_id:
        query = query.filter(DBChangeLog.credential_id == credential_id)
    if tenant:
        query = query.filter(DBChangeLog.tenant_code == tenant)
    if action:
        query = query.filter(DBChangeLog.action == action)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                DBChangeLog.service_name.ilike(like),
                DBChangeLog.changed_by.ilike(like),
                DBChangeLog.credential_id.ilike(like),
            )
        )

    rows = query.all()

    def _generate():
        output = io.StringIO()
        writer = csv.writer(output)
        # Header
        writer.writerow([
            "LogID", "Timestamp", "CredentialID", "TenantCode", "TenantName",
            "ServiceName", "Action", "FieldChanged", "OldValueMasked",
            "NewValueMasked", "ChangedBy", "ChangedByEmail", "Reason", "Notes",
        ])
        yield output.getvalue()
        output.truncate(0)
        output.seek(0)

        for row in rows:
            writer.writerow([
                row.log_id or "",
                row.timestamp or "",
                row.credential_id or "",
                row.tenant_code or "",
                row.tenant_name or "",
                row.service_name or "",
                row.action or "",
                row.field_changed or "",
                row.old_value_masked or "",
                row.new_value_masked or "",
                row.changed_by or "",
                row.changed_by_email or "",
                row.reason or "",
                row.notes or "",
            ])
            yield output.getvalue()
            output.truncate(0)
            output.seek(0)

    return StreamingResponse(
        _generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=changelog.csv"},
    )
