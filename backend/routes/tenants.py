"""
routes/tenants.py – Tenant, category and user reference endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import CategoryResponse, TenantResponse, UserResponse
from models_db import DBCategory, DBTenant, DBUser

# ── Category seed data (mirrors Excel Categories sheet) ─────────────────────
_CATEGORY_SEED = [
    ("CAT-M365", "Microsoft 365", "M365", "Microsoft 365 tenant and service accounts",
     "Global Admin;Exchange Admin;SharePoint Admin;Teams Admin;User Account;Mailbox Access (OTP/SSO);Service Account"),
    ("CAT-CLOUD", "Cloud Infrastructure", "CLOUD", "Amazon Web Services, Microsoft Azure, DigitalOcean and other cloud providers",
     "AWS Root;AWS IAM User;Azure Portal;Azure Sub Owner;DigitalOcean;Google Cloud Portal;Service Principal"),
    ("CAT-DNS", "Domain & DNS", "DNS", "Domain registrars, DNS hosting and SSL certificates",
     "Domain Registrar;DNS Provider;SSL/TLS Certificate;CDN;Domain Forwarding"),
    ("CAT-HOST", "Web Hosting & Panels", "HOST", "Server control panels, cPanel, WHM, Plesk, and hosting portal access",
     "cPanel;Plesk;WHM;Web Host Portal;Virtual Private Server (VPS);Managed Hosting"),
    ("CAT-CMS", "CMS & Websites", "CMS", "Content Management Systems (WordPress, Django, CMS portals) and site admin panels",
     "WordPress Admin;Django Admin;Shopify Admin;Webflow;Squarespace;Custom CMS"),
    ("CAT-GOOG", "Google Ecosystem", "GOOG", "Google Search Console, Google Business Profile, Analytics and Google account credentials",
     "Google Search Console;Google Business Profile (GMB);Google Analytics;Google Tag Manager;Workspace Admin"),
    ("CAT-DB", "Databases", "DB", "Database administration, SQL Server, Azure SQL, MySQL, and PostgreSQL logins",
     "Azure SQL;MySQL/MariaDB;PostgreSQL;Microsoft SQL Server;MongoDB;Redis;Database Administrator"),
    ("CAT-FTP", "FTP & File Sharing", "FTP", "File transfer protocol (FTP, SFTP) credentials and cloud/network storage vaults",
     "SFTP;FTP;FTPS;S3 Bucket;WebDAV;Network File Share"),
    ("CAT-ERP", "ERP & Business Portals", "ERP", "Zoho, Odoo, task workflow portals, and learning platforms",
     "Zoho Admin;Zoho User;Odoo Admin;Odoo User;ERP Portal;Task Assignment;Workflow Portal"),
    ("CAT-MKT", "Marketing & Creative", "MKT", "Marketing tools, graphic design, and creative suite applications",
     "Adobe Creative Cloud;Graphic Design Tool;Email Marketing (Mailchimp);SEO/SEM Tool;Marketing Analytics;Canva"),
    ("CAT-SOC", "Social Media", "SOC", "Brand social media handles and ad manager accounts",
     "Facebook/Meta;Instagram;Twitter/X;LinkedIn;YouTube;TikTok;Pinterest"),
    ("CAT-AI", "AI & Chatbots", "AI", "Artificial Intelligence systems, LLM tools, and AI developer portals",
     "ChatGPT (OpenAI);Claude (Anthropic);Gemini (Google);Copilot;AI API Key;Custom Chatbot"),
    ("CAT-HR", "HR & Recruitment", "HR", "HR management systems (HRMS), job portals (Naukri, Indeed), and payroll portal access",
     "HRMS Portal;Recruitment Portal (Naukri/Indeed);Payroll System;Attendance/Leave System"),
    ("CAT-FIN", "Finance & Accounting", "FIN", "Accounting softwares (Zoho Admin, Odoo Admin, users, etc.) and invoicing platforms",
     "Zoho Books/Finance;Odoo Accounting;Accounting Software;Payment Gateway;Billing/Invoice Portal"),
    ("CAT-WORK", "Workflow & Productivity", "WORK", "Team collaboration, task tracking, and learning portals",
     "Jira;Monday.com;Asana;Trello;ClickUp;Slack;Microsoft Teams;Learning Portal (Udemy)"),
    ("CAT-NET", "Network & CCTV", "NET", "Router/switch logins, internal WiFi, and CCTV/NVR surveillance cameras",
     "WiFi Router/Access Point;Firewall/Switch;CCTV Camera/NVR;Network Attached Storage (NAS);ISP Admin Portal"),
    ("CAT-TEL", "Telecom & Utility", "TEL", "Network service providers, postpaid sim portals, and broadband logins",
     "Postpaid SIM Portal;WiFi Service Provider;Telecom Login;Broadband Portal"),
    ("CAT-OTH", "Other", "OTH", "Miscellaneous credentials not covered in above categories",
     "General;Utility;Hardware/IoT;Security Vault"),
]


def seed_categories(db: Session) -> None:
    """Populate or update the categories table to match _CATEGORY_SEED."""
    seed_map = {cat[0]: cat for cat in _CATEGORY_SEED}
    for cat_id, name, code, desc, subs in _CATEGORY_SEED:
        existing = db.query(DBCategory).filter(DBCategory.category_id == cat_id).first()
        if existing:
            existing.category_name = name
            existing.category_code = code
            existing.description = desc
            existing.subcategories = subs
        else:
            db.add(DBCategory(
                category_id=cat_id, category_name=name, category_code=code,
                description=desc, subcategories=subs,
            ))
    # Delete categories that are no longer in seed list
    db.query(DBCategory).filter(DBCategory.category_id.notin_(list(seed_map.keys()))).delete(synchronize_session=False)
    db.commit()


router = APIRouter(prefix="/api", tags=["tenants"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class CreateTenantRequest(BaseModel):
    tenant_code: str
    tenant_name: str
    industry: Optional[str] = ""
    primary_contact: Optional[str] = ""
    contact_email: Optional[str] = ""
    contact_phone: Optional[str] = ""
    account_manager: Optional[str] = ""
    contract_start: Optional[str] = ""
    contract_end: Optional[str] = ""
    status: Optional[str] = "Active"
    notes: Optional[str] = ""


class UpdateTenantRequest(BaseModel):
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _next_tenant_id(db: Session) -> str:
    """Return the next T-NNN tenant identifier."""
    row = (
        db.query(DBTenant.tenant_id)
        .order_by(DBTenant.tenant_id.desc())
        .first()
    )
    if row:
        try:
            num = int(row[0].split("-")[-1])
        except (ValueError, IndexError):
            num = 0
        return f"T-{num + 1:03d}"
    return "T-001"


def _to_response(t: DBTenant) -> TenantResponse:
    return TenantResponse(
        tenant_id=t.tenant_id,
        tenant_code=t.tenant_code,
        tenant_name=t.tenant_name,
        industry=t.industry,
        primary_contact=t.primary_contact,
        contact_email=t.contact_email,
        contact_phone=t.contact_phone,
        account_manager=t.account_manager,
        contract_start=t.contract_start,
        contract_end=t.contract_end,
        status=t.status,
        notes=t.notes,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/tenants", response_model=List[TenantResponse])
def list_tenants(db: Session = Depends(get_db)) -> List[TenantResponse]:
    tenants = db.query(DBTenant).order_by(DBTenant.tenant_name).all()
    return [_to_response(t) for t in tenants]


@router.post("/tenant/create", response_model=TenantResponse, status_code=201)
def create_tenant(
    body: CreateTenantRequest,
    db: Session = Depends(get_db),
) -> TenantResponse:
    # Validate uniqueness of tenant_code
    existing = db.query(DBTenant).filter(
        DBTenant.tenant_code == body.tenant_code
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Tenant with code '{body.tenant_code}' already exists.",
        )

    tenant = DBTenant(
        tenant_id=_next_tenant_id(db),
        tenant_code=body.tenant_code,
        tenant_name=body.tenant_name,
        industry=body.industry or "",
        primary_contact=body.primary_contact or "",
        contact_email=body.contact_email or "",
        contact_phone=body.contact_phone or "",
        account_manager=body.account_manager or "",
        contract_start=body.contract_start or "",
        contract_end=body.contract_end or "",
        status=body.status or "Active",
        notes=body.notes or "",
        needs_sync=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


@router.post("/tenant/update/{tenant_code}", response_model=TenantResponse)
def update_tenant(
    tenant_code: str,
    body: UpdateTenantRequest,
    db: Session = Depends(get_db),
) -> TenantResponse:
    tenant = db.query(DBTenant).filter(
        DBTenant.tenant_code == tenant_code
    ).first()
    if not tenant:
        raise HTTPException(
            status_code=404,
            detail=f"Tenant with code '{tenant_code}' not found.",
        )

    updatable = [
        "tenant_name", "industry", "primary_contact", "contact_email",
        "contact_phone", "account_manager", "contract_start", "contract_end",
        "status", "notes",
    ]
    for field in updatable:
        val = getattr(body, field, None)
        if val is not None:
            setattr(tenant, field, val)

    tenant.needs_sync = True
    db.commit()
    db.refresh(tenant)
    return _to_response(tenant)


# ---------------------------------------------------------------------------
# Categories (read-only reference data)
# ---------------------------------------------------------------------------

def _cat_to_response(c: DBCategory) -> CategoryResponse:
    subs = [s.strip() for s in (c.subcategories or "").split(";") if s.strip()]
    return CategoryResponse(
        category_id=c.category_id,
        category_name=c.category_name,
        category_code=c.category_code,
        description=c.description,
        subcategories=subs,
    )


@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(db: Session = Depends(get_db)) -> List[CategoryResponse]:
    seed_categories(db)
    cats = db.query(DBCategory).order_by(DBCategory.category_id).all()
    return [_cat_to_response(c) for c in cats]


@router.get("/category/{category_name}/subcategories", response_model=List[str])
def get_subcategories(category_name: str, db: Session = Depends(get_db)) -> List[str]:
    seed_categories(db)
    cat = db.query(DBCategory).filter(DBCategory.category_name == category_name).first()
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{category_name}' not found.")
    return [s.strip() for s in (cat.subcategories or "").split(";") if s.strip()]


# ---------------------------------------------------------------------------
# Internal Users
# ---------------------------------------------------------------------------

class CreateUserRequest(BaseModel):
    full_name: str
    email: str
    role: Optional[str] = "Viewer"
    department: Optional[str] = ""
    access_level: Optional[str] = "View Only"
    status: Optional[str] = "Active"
    notes: Optional[str] = ""


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    access_level: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


def _next_user_id(db: Session) -> str:
    row = db.query(DBUser.user_id).order_by(DBUser.user_id.desc()).first()
    if row:
        try:
            num = int(row[0].split("-")[-1])
        except (ValueError, IndexError):
            num = 0
        return f"USR-{num + 1:03d}"
    return "USR-001"


@router.get("/users", response_model=List[UserResponse])
def list_users(db: Session = Depends(get_db)) -> List[UserResponse]:
    users = db.query(DBUser).order_by(DBUser.full_name).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("/user/create", response_model=UserResponse, status_code=201)
def create_user(body: CreateUserRequest, db: Session = Depends(get_db)) -> UserResponse:
    if db.query(DBUser).filter(DBUser.email == body.email).first():
        raise HTTPException(status_code=409, detail=f"User '{body.email}' already exists.")
    user = DBUser(
        user_id=_next_user_id(db),
        full_name=body.full_name, email=body.email,
        role=body.role or "Viewer", department=body.department or "",
        access_level=body.access_level or "View Only",
        status=body.status or "Active", notes=body.notes or "",
        needs_sync=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/user/update/{email}", response_model=UserResponse)
def update_user(email: str, body: UpdateUserRequest, db: Session = Depends(get_db)) -> UserResponse:
    user = db.query(DBUser).filter(DBUser.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{email}' not found.")
    for field in ["full_name", "role", "department", "access_level", "status", "notes"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(user, field, val)
    user.needs_sync = True
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/user/{email}", status_code=204)
def delete_user(email: str, db: Session = Depends(get_db)) -> None:
    user = db.query(DBUser).filter(DBUser.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{email}' not found.")
    db.delete(user)
    db.commit()


# ---------------------------------------------------------------------------
# Tenant delete
# ---------------------------------------------------------------------------

@router.delete("/tenant/{tenant_code}", status_code=204)
def delete_tenant(tenant_code: str, db: Session = Depends(get_db)) -> None:
    from models_db import DBCredential
    tenant = db.query(DBTenant).filter(DBTenant.tenant_code == tenant_code).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_code}' not found.")
    cred_count = db.query(DBCredential).filter(DBCredential.tenant_code == tenant_code).count()
    if cred_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete tenant '{tenant_code}': {cred_count} credential(s) still reference it.",
        )
    db.delete(tenant)
    db.commit()


# ---------------------------------------------------------------------------
# Category CRUD
# ---------------------------------------------------------------------------

class CreateCategoryRequest(BaseModel):
    category_name: str
    category_code: str
    description: Optional[str] = ""
    subcategories: Optional[str] = ""  # semicolon-separated


class UpdateCategoryRequest(BaseModel):
    category_name: Optional[str] = None
    category_code: Optional[str] = None
    description: Optional[str] = None
    subcategories: Optional[str] = None


def _next_category_id(db: Session) -> str:
    row = db.query(DBCategory.category_id).order_by(DBCategory.category_id.desc()).first()
    if row:
        try:
            num = int(row[0].split("-")[-1])
        except (ValueError, IndexError):
            num = 0
        return f"CAT-{num + 1:03d}"
    return "CAT-001"


@router.post("/category/create", response_model=CategoryResponse, status_code=201)
def create_category(body: CreateCategoryRequest, db: Session = Depends(get_db)) -> CategoryResponse:
    existing = db.query(DBCategory).filter(DBCategory.category_name == body.category_name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{body.category_name}' already exists.")
    cat = DBCategory(
        category_id=_next_category_id(db),
        category_name=body.category_name,
        category_code=body.category_code,
        description=body.description or "",
        subcategories=body.subcategories or "",
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _cat_to_response(cat)


@router.post("/category/update/{category_id}", response_model=CategoryResponse)
def update_category(category_id: str, body: UpdateCategoryRequest, db: Session = Depends(get_db)) -> CategoryResponse:
    cat = db.query(DBCategory).filter(DBCategory.category_id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{category_id}' not found.")
    for field in ["category_name", "category_code", "description", "subcategories"]:
        val = getattr(body, field, None)
        if val is not None:
            setattr(cat, field, val)
    db.commit()
    db.refresh(cat)
    return _cat_to_response(cat)


@router.delete("/category/{category_id}", status_code=204)
def delete_category(category_id: str, db: Session = Depends(get_db)) -> None:
    cat = db.query(DBCategory).filter(DBCategory.category_id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail=f"Category '{category_id}' not found.")
    db.delete(cat)
    db.commit()
