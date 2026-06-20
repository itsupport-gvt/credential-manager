"""
models.py – Pydantic request/response schemas for the Credential Manager API.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Credential
# ---------------------------------------------------------------------------

class CredentialResponse(BaseModel):
    """
    Public representation of a credential.
    Encrypted fields are omitted; replaced by boolean has_* flags.
    """
    credential_id: Optional[str] = None
    tenant_code: Optional[str] = None
    tenant_name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    service_name: Optional[str] = None
    service_url: Optional[str] = None
    environment: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    username_email: Optional[str] = None
    # Presence flags (no plaintext secrets in list responses)
    has_password: bool = False
    has_api_key: bool = False
    has_api_secret: bool = False
    has_client_secret: bool = False
    recovery_email: Optional[str] = None
    recovery_phone: Optional[str] = None
    mfa_enabled: Optional[str] = None
    mfa_type: Optional[str] = None
    mfa_app_name: Optional[str] = None
    backup_codes_location: Optional[str] = None
    security_notes: Optional[str] = None
    account_display_name: Optional[str] = None
    account_id: Optional[str] = None
    license_type: Optional[str] = None
    plan_tier: Optional[str] = None
    subscription_start: Optional[str] = None
    subscription_end: Optional[str] = None
    auto_renewal: Optional[str] = None
    monthly_cost: Optional[float] = None
    billing_cycle: Optional[str] = None
    billing_email: Optional[str] = None
    payment_reference: Optional[str] = None
    access_level: Optional[str] = None
    linked_credential_id: Optional[str] = None
    client_id: Optional[str] = None
    tenant_id_app: Optional[str] = None
    subscription_id_azure: Optional[str] = None
    server_hostname: Optional[str] = None
    port: Optional[str] = None
    protocol: Optional[str] = None
    database_name: Optional[str] = None
    managed_by: Optional[str] = None
    managed_by_email: Optional[str] = None
    created_by: Optional[str] = None
    created_date: Optional[str] = None
    last_updated_by: Optional[str] = None
    last_updated_date: Optional[str] = None
    last_verified_date: Optional[str] = None
    last_password_changed: Optional[str] = None
    password_expiry_date: Optional[str] = None
    next_review_date: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None
    record_status: Optional[str] = None

    model_config = {"from_attributes": True}


class CredentialsPage(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    items: List[CredentialResponse]


class CreateCredentialRequest(BaseModel):
    """Create a new credential.  Plain-text secrets are encrypted on write."""
    tenant_code: Optional[str] = ""
    tenant_name: Optional[str] = ""
    category: Optional[str] = ""
    subcategory: Optional[str] = ""
    service_name: Optional[str] = ""
    service_url: Optional[str] = ""
    environment: Optional[str] = ""
    status: Optional[str] = "Active"
    priority: Optional[str] = "Medium"
    username_email: Optional[str] = ""
    # Plain-text – encrypted before storage
    password: str = ""
    api_key: str = ""
    api_secret: str = ""
    client_secret: str = ""
    recovery_email: Optional[str] = ""
    recovery_phone: Optional[str] = ""
    mfa_enabled: Optional[str] = "No"
    mfa_type: Optional[str] = ""
    mfa_app_name: Optional[str] = ""
    backup_codes_location: Optional[str] = ""
    security_notes: Optional[str] = ""
    account_display_name: Optional[str] = ""
    account_id: Optional[str] = ""
    license_type: Optional[str] = ""
    plan_tier: Optional[str] = ""
    subscription_start: Optional[str] = ""
    subscription_end: Optional[str] = ""
    auto_renewal: Optional[str] = ""
    monthly_cost: Optional[float] = 0.0
    billing_cycle: Optional[str] = ""
    billing_email: Optional[str] = ""
    payment_reference: Optional[str] = ""
    access_level: Optional[str] = ""
    linked_credential_id: Optional[str] = ""
    client_id: Optional[str] = ""
    tenant_id_app: Optional[str] = ""
    subscription_id_azure: Optional[str] = ""
    server_hostname: Optional[str] = ""
    port: Optional[str] = ""
    protocol: Optional[str] = ""
    database_name: Optional[str] = ""
    managed_by: Optional[str] = ""
    managed_by_email: Optional[str] = ""
    created_by: Optional[str] = ""
    created_date: Optional[str] = ""
    last_updated_by: Optional[str] = ""
    last_updated_date: Optional[str] = ""
    last_verified_date: Optional[str] = ""
    last_password_changed: Optional[str] = ""
    password_expiry_date: Optional[str] = ""
    next_review_date: Optional[str] = ""
    tags: Optional[str] = ""
    notes: Optional[str] = ""
    record_status: Optional[str] = "Active"


class UpdateCredentialRequest(CreateCredentialRequest):
    """Update an existing credential.  Same shape as Create."""
    pass


# ---------------------------------------------------------------------------
# Change Log
# ---------------------------------------------------------------------------

class ChangeLogItem(BaseModel):
    id: Optional[int] = None
    log_id: Optional[str] = None
    timestamp: Optional[str] = None
    credential_id: Optional[str] = None
    tenant_code: Optional[str] = None
    tenant_name: Optional[str] = None
    service_name: Optional[str] = None
    action: Optional[str] = None
    field_changed: Optional[str] = None
    old_value_masked: Optional[str] = None
    new_value_masked: Optional[str] = None
    changed_by: Optional[str] = None
    changed_by_email: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    source_log_id: Optional[str] = None

    model_config = {"from_attributes": True}


class ChangeLogPage(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    items: List[ChangeLogItem]


# ---------------------------------------------------------------------------
# Tenant
# ---------------------------------------------------------------------------

class TenantResponse(BaseModel):
    tenant_id: Optional[str] = None
    tenant_code: Optional[str] = None
    tenant_name: Optional[str] = None
    industry: Optional[str] = None
    primary_contact: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    account_manager: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategoryResponse(BaseModel):
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    category_code: Optional[str] = None
    description: Optional[str] = None
    subcategories: List[str] = []

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class UserResponse(BaseModel):
    user_id: Optional[str] = None
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

class StatsResponse(BaseModel):
    total_credentials: int = 0
    by_status: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    by_category: List[Dict[str, Any]] = []
    by_tenant: List[Dict[str, Any]] = []
    expiring_30d: int = 0
    expiring_90d: int = 0
    no_mfa: int = 0
    pending_sync: int = 0
    recent_log: List[ChangeLogItem] = []


# ---------------------------------------------------------------------------
# Sync status
# ---------------------------------------------------------------------------

class SyncStatusResponse(BaseModel):
    pending_credentials: int = 0
    pending_logs: int = 0
    last_sync: Optional[str] = None
