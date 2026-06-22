"""
auth.py – Microsoft Entra ID JWT validation and role-based access control.

Flow:
  1. Electron acquires an ID token via MSAL (PKCE / Authorization Code).
  2. The ID token is sent as  Authorization: Bearer <id_token>  on every request.
  3. This module validates the signature + audience + issuer using the tenant's
     JWKS endpoint, then reads the `roles` claim (Entra App Roles) to determine
     what the user is allowed to do.

Roles (defined as App Roles in the Entra app registration):
  CredManager.Admin   → full access
  CredManager.Editor  → create / update, no delete
  CredManager.Viewer  → read-only, can reveal passwords
  CredManager.Auditor → read-only + full audit log, cannot reveal

Auth is disabled (every request treated as anonymous Admin) when
AUTH_CLIENT_ID is not configured – preserves backward compat.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from config import TENANT_ID, AUTH_CLIENT_ID
from database import get_db

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

AUTH_ENABLED: bool = bool(TENANT_ID and AUTH_CLIENT_ID)

_JWKS_URL = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
_ISSUER   = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"

_jwks_client: Optional[PyJWKClient] = (
    PyJWKClient(_JWKS_URL, cache_keys=True, lifespan=3600) if AUTH_ENABLED else None
)

# Entra App Role values → internal permission tier
_ENTRA_ROLE_MAP: dict[str, str] = {
    "CredManager.Admin":   "Admin",
    "CredManager.Editor":  "Editor",
    "CredManager.Viewer":  "Viewer",
    "CredManager.Auditor": "Auditor",
}

# Priority order for resolving the highest role when a user has multiple
_ROLE_PRIORITY = ["Admin", "Editor", "Auditor", "Viewer"]

ALL_ROLES = _ROLE_PRIORITY  # exported for route use


# ---------------------------------------------------------------------------
# UserInfo
# ---------------------------------------------------------------------------

class UserInfo:
    def __init__(self, oid: str, name: str, email: str, role: str):
        self.oid   = oid
        self.name  = name
        self.email = email
        self.role  = role

    @property
    def display_name(self) -> str:
        return self.name or self.email or self.oid

    @property
    def is_admin(self)   -> bool: return self.role == "Admin"

    @property
    def is_editor(self)  -> bool: return self.role in ("Admin", "Editor")

    @property
    def is_viewer(self)  -> bool: return self.role in ("Admin", "Editor", "Viewer")

    @property
    def is_auditor(self) -> bool: return self.role in ("Admin", "Auditor")


# Fallback when auth is disabled – behaves like a super-admin
_ANONYMOUS = UserInfo("system", "System", "", "Admin")

# ---------------------------------------------------------------------------
# Token decoding
# ---------------------------------------------------------------------------

def _resolve_role(entra_roles: list[str]) -> Optional[str]:
    """Map Entra role values to the highest internal role. Returns None if none match."""
    local_roles = {_ENTRA_ROLE_MAP[r] for r in entra_roles if r in _ENTRA_ROLE_MAP}
    for tier in _ROLE_PRIORITY:
        if tier in local_roles:
            return tier
    return None


def _decode_id_token(token: str) -> dict:
    if not _jwks_client:
        raise RuntimeError("Auth not configured")
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=AUTH_CLIENT_ID,
        issuer=_ISSUER,
        leeway=60,
    )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[UserInfo]:
    """
    Validate the Bearer JWT and return a UserInfo.
    Returns None (anonymous) when AUTH_ENABLED is False.
    Raises 401 on bad token, 403 on inactive account or missing role.
    """
    if not AUTH_ENABLED:
        return None

    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        claims = _decode_id_token(credentials.credentials)
    except Exception as exc:
        logger.warning("Token validation failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    oid         = claims.get("oid", "")
    name        = claims.get("name", "")
    email       = claims.get("preferred_username", claims.get("email", ""))
    entra_roles = claims.get("roles", [])

    # Persist / update login record
    from models_db import DBAuthUser
    user_row = db.query(DBAuthUser).filter(DBAuthUser.oid == oid).first()
    now_iso = datetime.now(timezone.utc).isoformat()

    if not user_row:
        user_row = DBAuthUser(
            oid=oid, name=name, email=email,
            entra_roles=json.dumps(entra_roles),
            is_active=True,
            last_login=now_iso,
            created_at=now_iso,
        )
        db.add(user_row)
    else:
        if not user_row.is_active:
            raise HTTPException(status_code=403, detail="Your account has been disabled")
        user_row.name        = name
        user_row.email       = email
        user_row.entra_roles = json.dumps(entra_roles)
        user_row.last_login  = now_iso

    db.commit()

    role = _resolve_role(entra_roles)
    if role is None:
        raise HTTPException(
            status_code=403,
            detail="You have not been assigned a role for this application. Contact your administrator.",
        )

    return UserInfo(oid=oid, name=name, email=email, role=role)


# ---------------------------------------------------------------------------
# Optional dependency (used by /api/auth/me — never raises, returns None)
# ---------------------------------------------------------------------------

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[UserInfo]:
    """Like get_current_user but returns None instead of raising 401 when no/bad token."""
    if not AUTH_ENABLED or not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


# ---------------------------------------------------------------------------
# Role-guard dependencies
# ---------------------------------------------------------------------------

def require_viewer(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_viewer):
        raise HTTPException(status_code=403, detail="Access denied")
    return user or _ANONYMOUS


def require_editor(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_editor):
        raise HTTPException(status_code=403, detail="Editor role or higher required")
    return user or _ANONYMOUS


def require_admin(user: Optional[UserInfo] = Depends(get_current_user)) -> UserInfo:
    if AUTH_ENABLED and (not user or not user.is_admin):
        raise HTTPException(status_code=403, detail="Admin role required")
    return user or _ANONYMOUS
