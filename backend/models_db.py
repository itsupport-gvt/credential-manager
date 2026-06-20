"""
models_db.py – SQLAlchemy ORM models for the Credential Manager.
"""

from sqlalchemy import (
    Boolean,
    Column,
    Float,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# DBCredential
# ---------------------------------------------------------------------------

class DBCredential(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    credential_id = Column(String, unique=True, index=True, nullable=False)

    # Tenant
    tenant_code = Column(String, index=True, default="")
    tenant_name = Column(String, index=True, default="")

    # Classification
    category = Column(String, index=True, default="")
    subcategory = Column(String, default="")
    service_name = Column(String, index=True, default="")
    service_url = Column(String, default="")
    environment = Column(String, default="")

    # Status & priority
    status = Column(String, index=True, default="Active")
    priority = Column(String, index=True, default="Medium")

    # Primary credentials
    username_email = Column(String, default="")
    password_enc = Column(Text, default="")          # Fernet encrypted
    recovery_email = Column(String, default="")
    recovery_phone = Column(String, default="")

    # MFA
    mfa_enabled = Column(String, default="No")
    mfa_type = Column(String, default="")
    mfa_app_name = Column(String, default="")
    backup_codes_location = Column(String, default="")
    security_notes = Column(Text, default="")

    # Account info
    account_display_name = Column(String, default="")
    account_id = Column(String, default="")

    # Subscription / billing
    license_type = Column(String, default="")
    plan_tier = Column(String, default="")
    subscription_start = Column(String, default="")
    subscription_end = Column(String, index=True, default="")
    auto_renewal = Column(String, default="")
    monthly_cost = Column(Float, default=0.0)
    billing_cycle = Column(String, default="")
    billing_email = Column(String, default="")
    payment_reference = Column(String, default="")

    # Access
    access_level = Column(String, default="")
    linked_credential_id = Column(String, default="")

    # API / OAuth credentials (all encrypted)
    api_key_enc = Column(Text, default="")
    api_secret_enc = Column(Text, default="")
    client_id = Column(String, default="")
    client_secret_enc = Column(Text, default="")
    tenant_id_app = Column(String, default="")
    subscription_id_azure = Column(String, default="")

    # Infrastructure
    server_hostname = Column(String, default="")
    port = Column(String, default="")
    protocol = Column(String, default="")
    database_name = Column(String, default="")

    # Ownership
    managed_by = Column(String, default="")
    managed_by_email = Column(String, default="")
    created_by = Column(String, default="")
    created_date = Column(String, default="")
    last_updated_by = Column(String, default="")
    last_updated_date = Column(String, default="")
    last_verified_date = Column(String, default="")
    last_password_changed = Column(String, default="")
    password_expiry_date = Column(String, default="")
    next_review_date = Column(String, default="")

    # Misc
    tags = Column(String, default="")
    notes = Column(Text, default="")
    record_status = Column(String, default="Active")

    # Sync flag
    needs_sync = Column(Boolean, default=True)


# ---------------------------------------------------------------------------
# DBChangeLog
# ---------------------------------------------------------------------------

class DBChangeLog(Base):
    __tablename__ = "change_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    log_id = Column(String, unique=True, nullable=False)
    timestamp = Column(String, default="")
    credential_id = Column(String, index=True, default="")
    tenant_code = Column(String, default="")
    tenant_name = Column(String, default="")
    service_name = Column(String, default="")
    action = Column(String, default="")
    field_changed = Column(String, default="")
    old_value_masked = Column(String, default="")
    new_value_masked = Column(String, default="")
    changed_by = Column(String, default="")
    changed_by_email = Column(String, default="")
    reason = Column(String, default="")
    notes = Column(Text, default="")
    needs_sync = Column(Boolean, default=True)
    # Used to deduplicate rows pulled from Excel (Excel row-level log_id)
    source_log_id = Column(String, unique=True, nullable=True, index=True)


# ---------------------------------------------------------------------------
# DBTenant
# ---------------------------------------------------------------------------

class DBTenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(String, unique=True, nullable=False)
    tenant_code = Column(String, unique=True, index=True, nullable=False)
    tenant_name = Column(String, default="")
    industry = Column(String, default="")
    primary_contact = Column(String, default="")
    contact_email = Column(String, default="")
    contact_phone = Column(String, default="")
    account_manager = Column(String, default="")
    contract_start = Column(String, default="")
    contract_end = Column(String, default="")
    status = Column(String, default="Active")
    notes = Column(Text, default="")
    needs_sync = Column(Boolean, default=True)


# ---------------------------------------------------------------------------
# DBCategory
# ---------------------------------------------------------------------------

class DBCategory(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(String, unique=True, nullable=False)
    category_name = Column(String, unique=True, index=True, nullable=False)
    category_code = Column(String, unique=True, nullable=False)
    description = Column(String, default="")
    # Stored as semicolon-separated string, exposed as List[str] via Pydantic
    subcategories = Column(Text, default="")


# ---------------------------------------------------------------------------
# DBUser
# ---------------------------------------------------------------------------

class DBUser(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, unique=True, nullable=False)
    full_name = Column(String, default="")
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="")
    department = Column(String, default="")
    access_level = Column(String, default="")
    status = Column(String, default="Active")
    notes = Column(Text, default="")
    needs_sync = Column(Boolean, default=True)
