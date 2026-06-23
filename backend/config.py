"""
config.py – Load environment variables for the Credential Manager backend.

Resolution order:
1. CRED_DATA_DIR env var (set by Electron wrapper) → CRED_DATA_DIR/.env
2. Local backend/.env fallback
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ------------------------------------------------------------------
# Locate and load .env
# ------------------------------------------------------------------
_cred_data_dir = os.environ.get("CRED_DATA_DIR", "")
if _cred_data_dir:
    _env_path = Path(_cred_data_dir) / ".env"
else:
    _env_path = Path(__file__).parent / ".env"

# keep a module-level reference so crypto.py can write back to it
ENV_PATH: Path = _env_path

load_dotenv(_env_path, override=False)

# ------------------------------------------------------------------
# Azure AD / MSAL – SharePoint daemon (client credentials)
# ------------------------------------------------------------------
TENANT_ID: str = os.getenv("SHAREPOINT_TENANT_ID", "")
CLIENT_ID: str = os.getenv("SHAREPOINT_CLIENT_ID", "")
CLIENT_SECRET: str = os.getenv("SHAREPOINT_CLIENT_SECRET", "")

# ------------------------------------------------------------------
# Azure AD – User login (public client / PKCE)
# Falls back to SHAREPOINT_CLIENT_ID if the same app registration is used.
# ------------------------------------------------------------------
AUTH_CLIENT_ID: str = os.getenv("AUTH_CLIENT_ID", "") or CLIENT_ID

# ------------------------------------------------------------------
# SharePoint file
# ------------------------------------------------------------------
FILE_URL: str = os.getenv("SHAREPOINT_FILE_URL", "")

# ------------------------------------------------------------------
# Fernet encryption key (may be empty – crypto.py will generate it)
# ------------------------------------------------------------------
ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")

# ------------------------------------------------------------------
# Excel table names
# ------------------------------------------------------------------
CRED_TABLE: str = "tblCredentials"
LOG_TABLE: str = "tblChangeLog"
TENANT_TABLE: str = "tblTenants"
CAT_TABLE: str = "tblCategories"
USER_TABLE: str = "tblUsers"
REF_DATA_TABLE: str = "tblReferenceData"
