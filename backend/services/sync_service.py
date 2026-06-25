"""
services/sync_service.py – Bidirectional Excel ↔ SQLite sync.

Pattern:
  sync_from_excel(db)  – Pull all rows from SharePoint workbook tables → SQLite
  sync_to_excel(db)    – Push needs_sync=True rows → SharePoint workbook tables

Excel column names mirror the tbl* table headers in Credential_Manager.xlsx.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, date
from typing import Any, Optional

from sqlalchemy.orm import Session

import config
import crypto
from graph_client import GraphClient
from models_db import DBCategory, DBChangeLog, DBCredential, DBReferenceData, DBTenant, DBUser

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global sync state (read by /api/sync/status)
# ---------------------------------------------------------------------------

sync_status: dict[str, Any] = {
    "state": "idle",
    "last_sync": None,
    "error": None,
}

# ---------------------------------------------------------------------------
# Excel column → DB field mapping for tblCredentials
# ---------------------------------------------------------------------------
# Keys are exact Excel column header names; values are DBCredential field names.

CRED_COLUMN_MAP: dict[str, str] = {
    "CredentialID": "credential_id",
    "Credential_Type": "credential_type",
    "Tenant_Code": "tenant_code",
    "Tenant_Name": "tenant_name",
    "Category": "category",
    "Subcategory": "subcategory",
    "Service_Name": "service_name",
    "Service_URL": "service_url",
    "Environment": "environment",
    "Status": "status",
    "Priority": "priority",
    "Username_Email": "username_email",
    "Password": "password_enc",          # plaintext in Excel → encrypt
    "Recovery_Email": "recovery_email",
    "Recovery_Phone": "recovery_phone",
    "MFA_Enabled": "mfa_enabled",
    "MFA_Type": "mfa_type",
    "MFA_App_Name": "mfa_app_name",
    "Backup_Codes_Location": "backup_codes_location",
    "Security_Notes": "security_notes",
    "Account_Display_Name": "account_display_name",
    "Account_ID": "account_id",
    "License_Type": "license_type",
    "Plan_Tier": "plan_tier",
    "Subscription_Start": "subscription_start",
    "Subscription_End": "subscription_end",
    "Auto_Renewal": "auto_renewal",
    "Monthly_Cost": "monthly_cost",
    "Billing_Cycle": "billing_cycle",
    "Billing_Email": "billing_email",
    "Payment_Reference": "payment_reference",
    "Access_Level": "access_level",
    "Linked_Credential_ID": "linked_credential_id",
    "API_Key": "api_key_enc",            # plaintext in Excel → encrypt
    "API_Secret": "api_secret_enc",      # plaintext in Excel → encrypt
    "Client_ID": "client_id",
    "Client_Secret": "client_secret_enc",  # plaintext in Excel → encrypt
    "Tenant_ID_App": "tenant_id_app",
    "Subscription_ID_Azure": "subscription_id_azure",
    "Server_Hostname": "server_hostname",
    "Port": "port",
    "Protocol": "protocol",
    "Database_Name": "database_name",
    "Managed_By": "managed_by",
    "Managed_By_Email": "managed_by_email",
    "Created_By": "created_by",
    "Created_Date": "created_date",
    "Last_Updated_By": "last_updated_by",
    "Last_Updated_Date": "last_updated_date",
    "Last_Verified_Date": "last_verified_date",
    "Last_Password_Changed": "last_password_changed",
    "Password_Expiry_Date": "password_expiry_date",
    "Next_Review_Date": "next_review_date",
    "Tags": "tags",
    "Notes": "notes",
    "Record_Status": "record_status",
    "Last_Modified_At": "local_modified_at",
}

# Encrypted DB fields that carry plaintext from Excel
_ENC_FIELDS = {"password_enc", "api_key_enc", "api_secret_enc", "client_secret_enc"}

# Reverse map: DB field → Excel column (used when pushing)
_DB_TO_EXCEL_CRED: dict[str, str] = {v: k for k, v in CRED_COLUMN_MAP.items()}
# Decrypt-on-push overrides (DB encrypted field → Excel plaintext column name)
_ENC_TO_EXCEL_PLAIN: dict[str, str] = {
    "password_enc": "Password",
    "api_key_enc": "API_Key",
    "api_secret_enc": "API_Secret",
    "client_secret_enc": "Client_Secret",
}

# ---------------------------------------------------------------------------
# Excel column maps for other tables
# ---------------------------------------------------------------------------

LOG_COLUMN_MAP: dict[str, str] = {
    "LogID": "log_id",
    "Timestamp": "timestamp",
    "CredentialID": "credential_id",
    "Tenant_Code": "tenant_code",
    "Tenant_Name": "tenant_name",
    "Service_Name": "service_name",
    "Action": "action",
    "Field_Changed": "field_changed",
    "Old_Value_Masked": "old_value_masked",
    "New_Value_Masked": "new_value_masked",
    "Changed_By": "changed_by",
    "Changed_By_Email": "changed_by_email",
    "Reason": "reason",
    "Notes": "notes",
}

TENANT_COLUMN_MAP: dict[str, str] = {
    "TenantID": "tenant_id",
    "Tenant_Code": "tenant_code",
    "Tenant_Name": "tenant_name",
    "Industry": "industry",
    "Primary_Contact": "primary_contact",
    "Contact_Email": "contact_email",
    "Contact_Phone": "contact_phone",
    "Account_Manager": "account_manager",
    "Contract_Start": "contract_start",
    "Contract_End": "contract_end",
    "Status": "status",
    "Notes": "notes",
}

CAT_COLUMN_MAP: dict[str, str] = {
    "CategoryID": "category_id",
    "Category_Name": "category_name",
    "Category_Code": "category_code",
    "Description": "description",
    "Subcategories": "subcategories",
}

USER_COLUMN_MAP: dict[str, str] = {
    "UserID": "user_id",
    "Full_Name": "full_name",
    "Email": "email",
    "Role": "role",
    "Department": "department",
    "Access_Level": "access_level",
    "Status": "status",
    "Notes": "notes",
}


# ---------------------------------------------------------------------------
# Date normalisation helpers
# ---------------------------------------------------------------------------

def _excel_serial_to_date(serial: Any) -> str:
    """Convert an Excel date serial number (float/int) to ISO 'YYYY-MM-DD'."""
    try:
        serial_int = int(float(serial))
        # Excel epoch: 1899-12-30 (accounting for the Lotus 1-2-3 leap year bug)
        epoch = date(1899, 12, 30)
        result = epoch + __import__("datetime").timedelta(days=serial_int)
        return result.isoformat()
    except Exception:
        return ""


def _normalize_date(value: Any) -> str:
    """
    Convert various date representations to 'YYYY-MM-DD'.

    Handles:
    - Excel serial integers/floats
    - ISO strings with or without time components
    - Blank / None → ""
    """
    if value is None or value == "":
        return ""
    # Numeric serial
    try:
        fval = float(value)
        if fval > 1000:  # serial dates are > 1000
            return _excel_serial_to_date(fval)
    except (TypeError, ValueError):
        pass
    # String
    s = str(value).strip()
    if not s:
        return ""
    # Try to chop off time component
    if "T" in s:
        s = s.split("T")[0]
    if " " in s:
        s = s.split(" ")[0]
    # Already YYYY-MM-DD
    if len(s) == 10 and s[4] == "-":
        return s
    # Try common formats
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y%m%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return s  # return as-is if unparseable


# ---------------------------------------------------------------------------
# Generic column header normaliser
# ---------------------------------------------------------------------------

def _normalise_key(key: str) -> str:
    """Return *key* stripped and with spaces replaced by underscores."""
    return key.strip().replace(" ", "_")


def _map_row(excel_row: dict[str, Any], col_map: dict[str, str]) -> dict[str, Any]:
    """
    Convert an Excel row dict to a DB field dict using *col_map*.

    Tries exact header names first, then normalised variants.
    """
    normalised_map = {_normalise_key(k): v for k, v in col_map.items()}
    result: dict[str, Any] = {}
    for raw_key, raw_val in excel_row.items():
        if raw_key == "_row_index":
            continue
        norm = _normalise_key(raw_key)
        db_field = col_map.get(raw_key) or normalised_map.get(norm)
        if db_field:
            result[db_field] = raw_val
    return result


def _str(val: Any) -> str:
    """Coerce *val* to string, treating None / NaN as ''."""
    if val is None:
        return ""
    s = str(val).strip()
    return "" if s.lower() in ("none", "nan") else s


# ---------------------------------------------------------------------------
# sync_from_excel
# ---------------------------------------------------------------------------

def sync_from_excel(db: Session, graph: GraphClient, scope: str = "all") -> dict[str, int]:
    """
    Pull all rows from SharePoint workbook tables into SQLite.

    scope: which tables to sync —
      "all"          – everything (default, backwards-compatible)
      "credentials"  – credentials + change log only
      "reference"    – tenants, categories, staff users

    Returns a dict with counts: {credentials, logs, tenants, categories, users}.
    """
    do_creds = scope in ("all", "credentials")
    do_ref   = scope in ("all", "reference")

    sync_status["state"] = "syncing"
    sync_status["error"] = None
    counts: dict[str, int] = {
        "credentials": 0,
        "logs": 0,
        "tenants": 0,
        "categories": 0,
        "users": 0,
    }

    try:
        # ---------------------------------------------------------------- #
        # 1. tblCredentials  (scope: credentials)
        # ---------------------------------------------------------------- #
        try:
            rows = graph.get_table_rows(config.CRED_TABLE) if do_creds else []
            for row in rows:
                fields = _map_row(row, CRED_COLUMN_MAP)
                cred_id = _str(fields.get("credential_id", ""))
                if not cred_id:
                    continue

                # Normalise date fields
                date_fields = [
                    "subscription_start", "subscription_end", "created_date",
                    "last_updated_date", "last_verified_date", "last_password_changed",
                    "password_expiry_date", "next_review_date",
                ]
                for df in date_fields:
                    if df in fields:
                        fields[df] = _normalize_date(fields[df])

                # Encrypt sensitive fields coming from Excel plain text
                for enc_field in _ENC_FIELDS:
                    if enc_field in fields:
                        plain = _str(fields[enc_field])
                        if plain and not crypto.is_encrypted(plain):
                            fields[enc_field] = crypto.encrypt(plain)
                        elif not plain:
                            fields[enc_field] = ""

                # Monthly cost as float
                if "monthly_cost" in fields:
                    try:
                        fields["monthly_cost"] = float(fields["monthly_cost"] or 0)
                    except (TypeError, ValueError):
                        fields["monthly_cost"] = 0.0

                existing = db.query(DBCredential).filter(
                    DBCredential.credential_id == cred_id
                ).first()
                if existing:
                    if existing.needs_sync:
                        # Local has unsynced changes — compare timestamps (last-write-wins)
                        excel_ts = _str(fields.get("local_modified_at", ""))
                        local_ts = existing.local_modified_at or ""
                        if excel_ts and local_ts and excel_ts <= local_ts:
                            # Local is newer or equal — skip this row; push will win
                            continue
                        # Excel is newer (or timestamps missing) — Excel wins
                    for k, v in fields.items():
                        if k != "credential_id" and hasattr(existing, k):
                            setattr(existing, k, v)
                    existing.needs_sync = False
                else:
                    new_cred = DBCredential(
                        credential_id=cred_id,
                        needs_sync=False,
                        **{k: v for k, v in fields.items() if k != "credential_id" and hasattr(DBCredential, k)},
                    )
                    db.add(new_cred)
                counts["credentials"] += 1

            db.commit()
            logger.info("Synced %d credentials from Excel.", counts["credentials"])
        except Exception as exc:
            logger.warning("Failed to sync tblCredentials: %s", exc)
            db.rollback()

        # ---------------------------------------------------------------- #
        # 2. tblChangeLog  (scope: credentials)
        # ---------------------------------------------------------------- #
        try:
            rows = graph.get_table_rows(config.LOG_TABLE) if do_creds else []
            for row in rows:
                fields = _map_row(row, LOG_COLUMN_MAP)
                log_id = _str(fields.get("log_id", ""))
                if not log_id:
                    continue
                # Deduplicate by source_log_id
                existing = db.query(DBChangeLog).filter(
                    DBChangeLog.source_log_id == log_id
                ).first()
                if existing:
                    continue
                new_log = DBChangeLog(
                    log_id=str(uuid.uuid4()),
                    source_log_id=log_id,
                    timestamp=_str(fields.get("timestamp", "")),
                    credential_id=_str(fields.get("credential_id", "")),
                    tenant_code=_str(fields.get("tenant_code", "")),
                    tenant_name=_str(fields.get("tenant_name", "")),
                    service_name=_str(fields.get("service_name", "")),
                    action=_str(fields.get("action", "")),
                    field_changed=_str(fields.get("field_changed", "")),
                    old_value_masked=_str(fields.get("old_value_masked", "")),
                    new_value_masked=_str(fields.get("new_value_masked", "")),
                    changed_by=_str(fields.get("changed_by", "")),
                    changed_by_email=_str(fields.get("changed_by_email", "")),
                    reason=_str(fields.get("reason", "")),
                    notes=_str(fields.get("notes", "")),
                    needs_sync=False,
                )
                db.add(new_log)
                counts["logs"] += 1

            db.commit()
            logger.info("Synced %d log entries from Excel.", counts["logs"])
        except Exception as exc:
            logger.warning("Failed to sync tblChangeLog: %s", exc)
            db.rollback()

        # ---------------------------------------------------------------- #
        # 3. tblTenants  (scope: reference)
        # ---------------------------------------------------------------- #
        try:
            rows = graph.get_table_rows(config.TENANT_TABLE) if do_ref else []
            for row in rows:
                fields = _map_row(row, TENANT_COLUMN_MAP)
                code = _str(fields.get("tenant_code", ""))
                if not code:
                    continue
                existing = db.query(DBTenant).filter(
                    DBTenant.tenant_code == code
                ).first()
                if existing:
                    for k, v in fields.items():
                        if k != "tenant_code" and hasattr(existing, k):
                            setattr(existing, k, _str(v))
                    existing.needs_sync = False
                else:
                    tid = _str(fields.get("tenant_id", "")) or f"T-{code}"
                    db.add(DBTenant(
                        tenant_id=tid,
                        tenant_code=code,
                        tenant_name=_str(fields.get("tenant_name", "")),
                        industry=_str(fields.get("industry", "")),
                        primary_contact=_str(fields.get("primary_contact", "")),
                        contact_email=_str(fields.get("contact_email", "")),
                        contact_phone=_str(fields.get("contact_phone", "")),
                        account_manager=_str(fields.get("account_manager", "")),
                        contract_start=_normalize_date(fields.get("contract_start")),
                        contract_end=_normalize_date(fields.get("contract_end")),
                        status=_str(fields.get("status", "Active")) or "Active",
                        notes=_str(fields.get("notes", "")),
                        needs_sync=False,
                    ))
                counts["tenants"] += 1

            db.commit()
            logger.info("Synced %d tenants from Excel.", counts["tenants"])
        except Exception as exc:
            logger.warning("Failed to sync tblTenants: %s", exc)
            db.rollback()

        # ---------------------------------------------------------------- #
        # 4. tblCategories  (scope: reference)
        # ---------------------------------------------------------------- #
        try:
            rows = graph.get_table_rows(config.CAT_TABLE) if do_ref else []
            for row in rows:
                fields = _map_row(row, CAT_COLUMN_MAP)
                cat_name = _str(fields.get("category_name", ""))
                if not cat_name:
                    continue
                existing = db.query(DBCategory).filter(
                    DBCategory.category_name == cat_name
                ).first()
                if existing:
                    for k, v in fields.items():
                        if k != "category_name" and hasattr(existing, k):
                            setattr(existing, k, _str(v))
                else:
                    cid = _str(fields.get("category_id", "")) or f"CAT-{cat_name[:6].upper()}"
                    ccode = _str(fields.get("category_code", "")) or cat_name[:6].upper()
                    db.add(DBCategory(
                        category_id=cid,
                        category_name=cat_name,
                        category_code=ccode,
                        description=_str(fields.get("description", "")),
                        subcategories=_str(fields.get("subcategories", "")),
                    ))
                counts["categories"] += 1

            db.commit()
            logger.info("Synced %d categories from Excel.", counts["categories"])
        except Exception as exc:
            logger.warning("Failed to sync tblCategories: %s", exc)
            db.rollback()

        # ---------------------------------------------------------------- #
        # 5. tblUsers  (scope: reference)
        # ---------------------------------------------------------------- #
        try:
            rows = graph.get_table_rows(config.USER_TABLE) if do_ref else []
            for row in rows:
                fields = _map_row(row, USER_COLUMN_MAP)
                email = _str(fields.get("email", ""))
                if not email:
                    continue
                existing = db.query(DBUser).filter(DBUser.email == email).first()
                if existing:
                    for k, v in fields.items():
                        if k != "email" and hasattr(existing, k):
                            setattr(existing, k, _str(v))
                    existing.needs_sync = False
                else:
                    uid = _str(fields.get("user_id", "")) or f"USR-{str(uuid.uuid4())[:8]}"
                    db.add(DBUser(
                        user_id=uid,
                        full_name=_str(fields.get("full_name", "")),
                        email=email,
                        role=_str(fields.get("role", "")),
                        department=_str(fields.get("department", "")),
                        access_level=_str(fields.get("access_level", "")),
                        status=_str(fields.get("status", "Active")) or "Active",
                        notes=_str(fields.get("notes", "")),
                        needs_sync=False,
                    ))
                counts["users"] += 1

            db.commit()
            logger.info("Synced %d users from Excel.", counts["users"])
        except Exception as exc:
            logger.warning("Failed to sync tblUsers: %s", exc)
            db.rollback()

    except Exception as exc:
        sync_status["state"] = "error"
        sync_status["error"] = str(exc)
        logger.error("sync_from_excel failed: %s", exc)
        raise

    sync_status["state"] = "idle"
    sync_status["last_sync"] = datetime.now(timezone.utc).isoformat()
    return counts


# ---------------------------------------------------------------------------
# sync_to_excel
# ---------------------------------------------------------------------------

def sync_to_excel(db: Session, graph: GraphClient, scope: str = "all") -> dict[str, int]:
    """
    Push pending (needs_sync=True) rows to the SharePoint workbook.

    scope: which tables to push —
      "all"          – everything (default)
      "credentials"  – credentials + change log only
      "reference"    – tenants, staff users, reference data

    Returns {pushed_credentials, pushed_logs, pushed_tenants, ...}.
    """
    do_creds = scope in ("all", "credentials")
    do_ref   = scope in ("all", "reference")

    sync_status["state"] = "syncing"
    sync_status["error"] = None
    counts: dict[str, int] = {
        "pushed_credentials": 0,
        "pushed_logs": 0,
        "pushed_tenants": 0,
    }

    try:
        # ---------------------------------------------------------------- #
        # 1. Credentials  (scope: credentials)
        # ---------------------------------------------------------------- #
        pending_creds = (
            db.query(DBCredential)
            .filter(DBCredential.needs_sync == True)  # noqa: E712
            .all()
        ) if do_creds else []
        if pending_creds:
            headers = graph.get_table_headers(config.CRED_TABLE)
            # Build lookup: credential_id → row_index from Excel
            excel_rows = graph.get_table_rows(config.CRED_TABLE)
            excel_index: dict[str, int] = {}
            for er in excel_rows:
                cid = _str(er.get("CredentialID", ""))
                if cid:
                    excel_index[cid] = er["_row_index"]

            for cred in pending_creds:
                row_dict: dict[str, Any] = {}
                for header in headers:
                    if header == "Authorized_Users":
                        # Serialized separately below
                        continue
                    db_field = CRED_COLUMN_MAP.get(header)
                    if db_field is None:
                        row_dict[header] = ""
                        continue
                    if db_field in _ENC_FIELDS:
                        # Decrypt before sending to Excel
                        enc_val = getattr(cred, db_field, "") or ""
                        row_dict[header] = crypto.decrypt(enc_val)
                    else:
                        val = getattr(cred, db_field, "")
                        row_dict[header] = "" if val is None else str(val) if not isinstance(val, (int, float)) else val

                # Serialize authorized_users as a human-readable string if column exists
                if "Authorized_Users" in headers:
                    try:
                        import json as _json
                        au_list = _json.loads(cred.authorized_users_json or "[]")
                        row_dict["Authorized_Users"] = "; ".join(
                            f"{u.get('name', '')} <{u.get('email', '')}> ({u.get('access_level', 'Read')})"
                            for u in au_list if u.get("email")
                        )
                    except Exception:
                        row_dict["Authorized_Users"] = ""

                if cred.credential_id in excel_index:
                    graph.update_table_row(
                        config.CRED_TABLE,
                        excel_index[cred.credential_id],
                        row_dict,
                        headers=headers,
                    )
                else:
                    graph.add_table_row(config.CRED_TABLE, row_dict, headers=headers)

                cred.needs_sync = False
                counts["pushed_credentials"] += 1

            db.commit()
            logger.info("Pushed %d credentials to Excel.", counts["pushed_credentials"])

        # ---------------------------------------------------------------- #
        # 2. Change log  (scope: credentials)
        # ---------------------------------------------------------------- #
        pending_logs = (
            db.query(DBChangeLog)
            .filter(DBChangeLog.needs_sync == True)  # noqa: E712
            .all()
        ) if do_creds else []
        if pending_logs:
            log_headers = graph.get_table_headers(config.LOG_TABLE)
            for log_row in pending_logs:
                # Use source_log_id if set, else use log_id
                excel_log_id = log_row.source_log_id or log_row.log_id
                if not excel_log_id:
                    excel_log_id = str(uuid.uuid4())
                    log_row.log_id = excel_log_id

                row_dict = {
                    "LogID": excel_log_id,
                    "Timestamp": log_row.timestamp or "",
                    "CredentialID": log_row.credential_id or "",
                    "Tenant_Code": log_row.tenant_code or "",
                    "Tenant_Name": log_row.tenant_name or "",
                    "Service_Name": log_row.service_name or "",
                    "Action": log_row.action or "",
                    "Field_Changed": log_row.field_changed or "",
                    "Old_Value_Masked": log_row.old_value_masked or "",
                    "New_Value_Masked": log_row.new_value_masked or "",
                    "Changed_By": log_row.changed_by or "",
                    "Changed_By_Email": log_row.changed_by_email or "",
                    "Reason": log_row.reason or "",
                    "Notes": log_row.notes or "",
                }
                graph.add_table_row(config.LOG_TABLE, row_dict, headers=log_headers)
                log_row.needs_sync = False
                log_row.source_log_id = excel_log_id
                counts["pushed_logs"] += 1

            db.commit()
            logger.info("Pushed %d log entries to Excel.", counts["pushed_logs"])

        # ---------------------------------------------------------------- #
        # 3. Tenants  (scope: reference)
        # ---------------------------------------------------------------- #
        pending_tenants = (
            db.query(DBTenant)
            .filter(DBTenant.needs_sync == True)  # noqa: E712
            .all()
        ) if do_ref else []
        if pending_tenants:
            tenant_headers = graph.get_table_headers(config.TENANT_TABLE)
            excel_tenant_rows = graph.get_table_rows(config.TENANT_TABLE)
            excel_tenant_index: dict[str, int] = {}
            for er in excel_tenant_rows:
                tc = _str(er.get("Tenant_Code", ""))
                if tc:
                    excel_tenant_index[tc] = er["_row_index"]

            for tenant in pending_tenants:
                row_dict = {
                    "TenantID": tenant.tenant_id or "",
                    "Tenant_Code": tenant.tenant_code or "",
                    "Tenant_Name": tenant.tenant_name or "",
                    "Industry": tenant.industry or "",
                    "Primary_Contact": tenant.primary_contact or "",
                    "Contact_Email": tenant.contact_email or "",
                    "Contact_Phone": tenant.contact_phone or "",
                    "Account_Manager": tenant.account_manager or "",
                    "Contract_Start": tenant.contract_start or "",
                    "Contract_End": tenant.contract_end or "",
                    "Status": tenant.status or "Active",
                    "Notes": tenant.notes or "",
                }
                if tenant.tenant_code in excel_tenant_index:
                    graph.update_table_row(
                        config.TENANT_TABLE,
                        excel_tenant_index[tenant.tenant_code],
                        row_dict,
                        headers=tenant_headers,
                    )
                else:
                    graph.add_table_row(config.TENANT_TABLE, row_dict, headers=tenant_headers)

                tenant.needs_sync = False
                counts["pushed_tenants"] += 1

            db.commit()
            logger.info("Pushed %d tenants to Excel.", counts["pushed_tenants"])

        # ---------------------------------------------------------------- #
        # 4. Users  (scope: reference)
        # ---------------------------------------------------------------- #
        pending_users = (
            db.query(DBUser)
            .filter(DBUser.needs_sync == True)  # noqa: E712
            .all()
        ) if do_ref else []
        if pending_users:
            user_headers = graph.get_table_headers(config.USER_TABLE)
            excel_user_rows = graph.get_table_rows(config.USER_TABLE)
            excel_user_index: dict[str, int] = {}
            for er in excel_user_rows:
                em = _str(er.get("Email", ""))
                if em:
                    excel_user_index[em] = er["_row_index"]

            for u in pending_users:
                row_dict = {
                    "UserID":       u.user_id or "",
                    "Full_Name":    u.full_name or "",
                    "Email":        u.email or "",
                    "Role":         u.role or "",
                    "Department":   u.department or "",
                    "Access_Level": u.access_level or "",
                    "Status":       u.status or "Active",
                    "Notes":        u.notes or "",
                }
                if u.email in excel_user_index:
                    graph.update_table_row(
                        config.USER_TABLE,
                        excel_user_index[u.email],
                        row_dict,
                        headers=user_headers,
                    )
                else:
                    graph.add_table_row(config.USER_TABLE, row_dict, headers=user_headers)

                u.needs_sync = False
                counts["pushed_users"] = counts.get("pushed_users", 0) + 1

            db.commit()
            logger.info("Pushed %d users to Excel.", counts.get("pushed_users", 0))

        # ---------------------------------------------------------------- #
        # 5. Reference Data  (scope: reference)
        # ---------------------------------------------------------------- #
        pending_ref = (
            db.query(DBReferenceData)
            .filter(DBReferenceData.needs_sync == True)  # noqa: E712
            .all()
        ) if do_ref else []
        if pending_ref:
            try:
                ref_headers = graph.get_table_headers(config.REF_DATA_TABLE)
                excel_ref_rows = graph.get_table_rows(config.REF_DATA_TABLE)
                excel_ref_index: dict[tuple[str, str], int] = {}
                for er in excel_ref_rows:
                    key = (_str(er.get("List_Name", "")), _str(er.get("Value", "")))
                    if key[0]:
                        excel_ref_index[key] = er["_row_index"]

                for ref in pending_ref:
                    row_dict = {
                        "List_Name":  ref.list_name,
                        "Value":      ref.value,
                        "Sort_Order": str(ref.sort_order),
                        "Is_Active":  "Yes" if ref.is_active else "No",
                    }
                    key = (ref.list_name, ref.value)
                    if key in excel_ref_index:
                        graph.update_table_row(
                            config.REF_DATA_TABLE,
                            excel_ref_index[key],
                            row_dict,
                            headers=ref_headers,
                        )
                    else:
                        graph.add_table_row(config.REF_DATA_TABLE, row_dict, headers=ref_headers)

                    ref.needs_sync = False
                    counts["pushed_ref_data"] = counts.get("pushed_ref_data", 0) + 1

                db.commit()
                logger.info("Pushed %d reference data rows to Excel.", counts.get("pushed_ref_data", 0))
            except Exception as exc:
                logger.warning("Failed to push reference data (tblReferenceData may not exist): %s", exc)
                db.rollback()

    except Exception as exc:
        sync_status["state"] = "error"
        sync_status["error"] = str(exc)
        logger.error("sync_to_excel failed: %s", exc)
        db.rollback()
        raise

    sync_status["state"] = "idle"
    sync_status["last_sync"] = datetime.now(timezone.utc).isoformat()
    return counts
