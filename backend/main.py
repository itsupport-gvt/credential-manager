"""
main.py – FastAPI application entry point for the Credential Manager.

Startup sequence:
  1. Create/migrate SQLite tables.
  2. If the DB is empty, attempt sync_from_excel (graceful failure).
  3. Start a background thread that runs sync_to_excel every 60 minutes.

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
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from database import SessionLocal, create_tables, engine, run_migrations
from models import SyncStatusResponse
from routes.changelog import router as changelog_router
from routes.credentials import router as credentials_router
from routes.stats import router as stats_router
from routes.tenants import router as tenants_router, seed_categories
from services.sync_service import sync_from_excel, sync_status, sync_to_excel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

APP_VERSION = "1.0.0"

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
# Auto-sync background thread
# ---------------------------------------------------------------------------

_SYNC_INTERVAL_SECONDS = 60 * 60  # 60 minutes
_stop_auto_sync = threading.Event()


def _auto_sync_loop() -> None:
    """Background thread: push pending records every 60 minutes."""
    logger.info("Auto-sync thread started (interval=%ds).", _SYNC_INTERVAL_SECONDS)
    while not _stop_auto_sync.wait(timeout=_SYNC_INTERVAL_SECONDS):
        logger.info("Auto-sync: pushing pending records to Excel.")
        db = SessionLocal()
        try:
            result = sync_to_excel(db)
            logger.info("Auto-sync complete: %s", result)
        except Exception as exc:
            logger.warning("Auto-sync failed: %s", exc)
        finally:
            db.close()


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

    # Seed reference data (categories) — idempotent, safe every startup
    db0 = SessionLocal()
    try:
        seed_categories(db0)
    finally:
        db0.close()

    # If DB is empty, attempt initial pull from Excel
    db = SessionLocal()
    try:
        from models_db import DBCredential
        count = db.query(DBCredential).count()
        if count == 0:
            logger.info("DB is empty – attempting initial sync from Excel.")
            try:
                result = sync_from_excel(db)
                logger.info("Initial sync complete: %s", result)
            except Exception as exc:
                logger.warning(
                    "Initial sync failed (SharePoint may not be configured): %s", exc
                )
    finally:
        db.close()

    # Start the auto-sync background thread
    _stop_auto_sync.clear()
    t = threading.Thread(target=_auto_sync_loop, daemon=True, name="auto-sync")
    t.start()

    yield  # Application is running

    # ---- Shutdown ----
    logger.info("Credential Manager shutting down.")
    _stop_auto_sync.set()


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
    allow_headers=["*", "X-App-Token"],
)

# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------

app.include_router(credentials_router)
app.include_router(tenants_router)
app.include_router(changelog_router)
app.include_router(stats_router)

# ---------------------------------------------------------------------------
# Sync endpoints
# ---------------------------------------------------------------------------

@app.post("/api/sync/push", tags=["sync"])
def sync_push() -> dict:
    """Push all pending (needs_sync=True) records to SharePoint Excel."""
    db = SessionLocal()
    try:
        result = sync_to_excel(db)
        return {"status": "ok", "result": result}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc)},
        )
    finally:
        db.close()


@app.post("/api/sync/pull", tags=["sync"])
def sync_pull() -> dict:
    """Pull all rows from SharePoint Excel into SQLite."""
    db = SessionLocal()
    try:
        result = sync_from_excel(db)
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
    # Mount static assets (JS, CSS, images)
    app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")

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

    lan_ip = _get_lan_ip()
    logger.info("Starting Credential Manager on http://%s:8100", lan_ip)
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8100,
        reload=False,
        log_level="info",
    )
