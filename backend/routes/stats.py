"""
routes/stats.py – Dashboard statistics endpoint.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import ChangeLogItem, StatsResponse
from models_db import DBChangeLog, DBCredential

router = APIRouter(prefix="/api", tags=["stats"])


def _to_log_item(row: DBChangeLog) -> ChangeLogItem:
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


@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)) -> StatsResponse:
    today = date.today()
    in_30 = (today + timedelta(days=30)).isoformat()
    in_90 = (today + timedelta(days=90)).isoformat()
    today_str = today.isoformat()

    # Only count Active record_status credentials
    active_creds = (
        db.query(DBCredential)
        .filter(DBCredential.record_status == "Active")
        .all()
    )
    total = len(active_creds)

    by_status: Dict[str, int] = defaultdict(int)
    by_priority: Dict[str, int] = defaultdict(int)
    by_category: Dict[str, int] = defaultdict(int)
    by_tenant: Dict[str, Dict[str, Any]] = {}

    expiring_30d = 0
    expiring_90d = 0
    no_mfa = 0

    for cred in active_creds:
        # Status breakdown
        status_key = cred.status or "Unknown"
        by_status[status_key] += 1

        # Priority breakdown
        priority_key = cred.priority or "Unknown"
        by_priority[priority_key] += 1

        # Category breakdown
        cat_key = cred.category or "Uncategorised"
        by_category[cat_key] += 1

        # Tenant breakdown
        tc = cred.tenant_code or "Unknown"
        if tc not in by_tenant:
            by_tenant[tc] = {"code": tc, "name": cred.tenant_name or tc, "count": 0}
        by_tenant[tc]["count"] += 1

        # Expiry checks
        end = cred.subscription_end or ""
        if end:
            if today_str <= end <= in_30:
                expiring_30d += 1
            if today_str <= end <= in_90:
                expiring_90d += 1

        # No-MFA check (only for Active status credentials)
        if (cred.mfa_enabled or "No") == "No" and (cred.status or "Active") == "Active":
            no_mfa += 1

    # Pending sync across all tables (only credentials table for simplicity)
    pending_sync = (
        db.query(DBCredential)
        .filter(DBCredential.needs_sync == True)  # noqa: E712
        .count()
    )

    # Recent log entries
    recent = (
        db.query(DBChangeLog)
        .order_by(DBChangeLog.timestamp.desc())
        .limit(10)
        .all()
    )

    return StatsResponse(
        total_credentials=total,
        by_status=dict(by_status),
        by_priority=dict(by_priority),
        by_category=sorted(
            [{"name": k, "count": v} for k, v in by_category.items()],
            key=lambda x: x["count"],
            reverse=True,
        ),
        by_tenant=sorted(
            list(by_tenant.values()),
            key=lambda x: x["count"],
            reverse=True,
        ),
        expiring_30d=expiring_30d,
        expiring_90d=expiring_90d,
        no_mfa=no_mfa,
        pending_sync=pending_sync,
        recent_log=[_to_log_item(r) for r in recent],
    )
