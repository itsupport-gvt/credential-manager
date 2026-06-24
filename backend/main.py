"""
main.py – FastAPI application entry point for the Credential Manager.

Startup sequence:
  1. Create/migrate SQLite tables.
  2. Seed reference data (categories + dropdown lists).

Sync is now strictly on-demand: each push/pull is triggered by the renderer
and uses the signed-in user's delegated Graph token (forwarded via the
X-MS-Graph-Token header). The previous 60-minute background daemon thread
was removed in v1.4 — without a long-lived client-credentials secret the
backend has no token to run silently with.

Routes:
  /api/*          – REST API (credentials, tenants, changelog, stats, sync)
  /health         – Health check
  /               – SPA catch-all (serves static/index.html)
"""

from __future__ import annotations

import hmac
import logging
import os
import socket
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from database import SessionLocal, create_tables, engine, run_migrations
from graph_client import GraphClient
from models import SyncStatusResponse
from routes.changelog import router as changelog_router
from routes.credentials import router as credentials_router
from routes.stats import router as stats_router
from routes.tenants import router as tenants_router, seed_categories
from routes.reference_data import router as reference_data_router, seed_reference_data
from routes.users import router as users_router, staff_router as staff_users_router
from services.sync_service import sync_from_excel, sync_status, sync_to_excel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

APP_VERSION = "1.4.0"

# Token set by Electron via env var on every launch. Empty = dev/browser mode (no enforcement).
_APP_SECRET_TOKEN: str = os.environ.get("APP_SECRET_TOKEN", "").strip()


class TokenAuthMiddleware(BaseHTTPMiddleware):
    """Require X-App-Token header on all /api/* routes when a token is configured."""

    async def dispatch(self, request: Request, call_next):
        if _APP_SECRET_TOKEN and request.url.path.startswith("/api/"):
            provided = request.headers.get("X-App-Token", "")
            if not hmac.compare_digest(provided, _APP_SECRET_TOKEN):
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)

# ---------------------------------------------------------------------------
# LAN IP detection (same UDP trick as asset app)
# ---------------------------------------------------------------------------

def _get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Startup ----
    logger.info("Credential Manager v%s starting up.", APP_VERSION)
    lan_ip = _get_lan_ip()
    logger.info("LAN IP: %s", lan_ip)

    # Ensure tables exist and run idempotent migrations
    create_tables(engine)
    run_migrations(engine)

    # Seed reference data (categories + dropdown lists) — idempotent, safe every startup
    db0 = SessionLocal()
    try:
        seed_categories(db0)
        seed_reference_data(db0)
    finally:
        db0.close()

    yield  # Application is running

    # ---- Shutdown ----
    logger.info("Credential Manager shutting down.")


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Credential Manager API",
    version=APP_VERSION,
    description="Manages credentials for multiple client tenants with SharePoint Excel sync.",
    lifespan=lifespan,
)

# Token auth – must be added before CORS so it runs first
app.add_middleware(TokenAuthMiddleware)

# CORS – localhost only (Electron renderer / dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:8100",  "http://127.0.0.1:8100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-App-Token", "X-MS-Graph-Token"],
)

# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------

app.include_router(credentials_router)
app.include_router(tenants_router)
app.include_router(changelog_router)
app.include_router(stats_router)
app.include_router(users_router)
app.include_router(staff_users_router)
app.include_router(reference_data_router)

# ---------------------------------------------------------------------------
# Graph token extraction (delegated, per-request)
# ---------------------------------------------------------------------------

def _graph_client_from_header(x_ms_graph_token: str | None) -> GraphClient:
    """Build a GraphClient from the X-MS-Graph-Token header sent by the renderer."""
    if not x_ms_graph_token:
        raise HTTPException(
            status_code=401,
            detail="Missing X-MS-Graph-Token header. Sign in with Microsoft to enable SharePoint sync.",
        )
    return GraphClient(token=x_ms_graph_token)


# ---------------------------------------------------------------------------
# Sync endpoints
# ---------------------------------------------------------------------------

@app.post("/api/sync/push", tags=["sync"])
def sync_push(x_ms_graph_token: str | None = Header(default=None)) -> dict:
    """Push all pending (needs_sync=True) records to SharePoint Excel."""
    graph = _graph_client_from_header(x_ms_graph_token)
    db = SessionLocal()
    try:
        result = sync_to_excel(db, graph)
        return {"status": "ok", "result": result}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )
    finally:
        db.close()


@app.post("/api/sync/pull", tags=["sync"])
def sync_pull(x_ms_graph_token: str | None = Header(default=None)) -> dict:
    """Pull all rows from SharePoint Excel into SQLite."""
    graph = _graph_client_from_header(x_ms_graph_token)
    db = SessionLocal()
    try:
        result = sync_from_excel(db, graph)
        return {"status": "ok", "result": result}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )
    finally:
        db.close()


@app.get("/api/sync/status", response_model=SyncStatusResponse, tags=["sync"])
def sync_status_endpoint() -> SyncStatusResponse:
    """Return the number of pending records and last sync timestamp."""
    db = SessionLocal()
    try:
        from models_db import DBChangeLog, DBCredential
        pending_creds = (
            db.query(DBCredential)
            .filter(DBCredential.needs_sync == True)  # noqa: E712
            .count()
        )
        pending_logs = (
            db.query(DBChangeLog)
            .filter(DBChangeLog.needs_sync == True)  # noqa: E712
            .count()
        )
    finally:
        db.close()

    return SyncStatusResponse(
        pending_credentials=pending_creds,
        pending_logs=pending_logs,
        last_sync=sync_status.get("last_sync"),
    )


# ---------------------------------------------------------------------------
# Admin: reset local DB and re-pull from SharePoint
# ---------------------------------------------------------------------------

@app.post("/api/admin/reset-db", tags=["admin"])
def reset_database(x_ms_graph_token: str | None = Header(default=None)) -> dict:
    """
    Wipe all local credential and changelog rows, then re-pull fresh data from
    the SharePoint Excel file. Useful when the source sheet has been rebuilt
    and the local cache is stale.
    """
    from models_db import DBCredential, DBChangeLog
    graph = _graph_client_from_header(x_ms_graph_token)
    db = SessionLocal()
    try:
        deleted_creds = db.query(DBCredential).count()
        deleted_logs  = db.query(DBChangeLog).count()
        db.query(DBChangeLog).delete()
        db.query(DBCredential).delete()
        db.commit()
        result = sync_from_excel(db, graph)
        return {
            "status": "ok",
            "deleted_credentials": deleted_creds,
            "deleted_logs": deleted_logs,
            "synced": result,
        }
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
def health_check() -> dict:
    return {"status": "ok", "version": APP_VERSION}


# ---------------------------------------------------------------------------
# Static file serving (React SPA)
# ---------------------------------------------------------------------------

# In a PyInstaller onefile frozen exe, data files land in sys._MEIPASS, not
# next to __file__ (which may resolve to the exe itself).
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    _static_dir = Path(sys._MEIPASS) / "static"
else:
    _static_dir = Path(__file__).parent / "static"

if _static_dir.exists():
    # Mount the /assets sub-directory so Vite's "/assets/index-xxx.js" references resolve
    _assets_dir = _static_dir / "assets"
    if _assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_catch_all(request: Request, full_path: str) -> FileResponse:
        """Serve index.html for any path not matched by an API route."""
        index = _static_dir / "index.html"
        if index.exists():
            return FileResponse(str(index))
        return JSONResponse(
            status_code=404,
            content={"detail": "Frontend not built. Run 'npm run build' in the frontend directory."},
        )
else:
    logger.warning(
        "Static directory '%s' not found – SPA will not be served.", _static_dir
    )

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {
            "message": "Credential Manager API",
            "version": APP_VERSION,
            "docs": "/docs",
        }


# ---------------------------------------------------------------------------
# Entrypoint (direct run)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    _port = int(os.environ.get("PORT", "8100"))
    lan_ip = _get_lan_ip()
    logger.info("Starting Credential Manager on http://%s:%d", lan_ip, _port)
    uvicorn.run(
        app,           # pass the object directly — string import breaks in PyInstaller
        host="127.0.0.1",
        port=_port,
        reload=False,
        log_level="info",
    )
