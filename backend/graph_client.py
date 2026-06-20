"""
graph_client.py – Microsoft Graph API client for SharePoint / Excel operations.

Uses MSAL (client-credentials flow) for authentication and httpx for HTTP.
Token is cached in-process and refreshed automatically on expiry.

Share URL resolution:
  SharePoint share URL → base64url token → /shares/{token}/driveItem
  → driveId + itemId used for all subsequent workbook calls.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
import msal

import config

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
_PAGE_SIZE = 200


def _encode_share_url(url: str) -> str:
    """Encode a SharePoint share URL to the Graph API share token format."""
    encoded = base64.urlsafe_b64encode(url.encode()).rstrip(b"=").decode()
    return f"u!{encoded}"


class GraphClient:
    """Thin wrapper around Microsoft Graph workbook/table endpoints."""

    def __init__(self) -> None:
        self._app: msal.ConfidentialClientApplication | None = None
        self._token: str | None = None
        self._drive_id: str | None = None
        self._item_id: str | None = None

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def _get_app(self) -> msal.ConfidentialClientApplication:
        if self._app is None:
            if not all([config.TENANT_ID, config.CLIENT_ID, config.CLIENT_SECRET]):
                raise RuntimeError(
                    "Azure AD credentials not configured. "
                    "Set SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, "
                    "SHAREPOINT_CLIENT_SECRET in .env"
                )
            self._app = msal.ConfidentialClientApplication(
                client_id=config.CLIENT_ID,
                client_credential=config.CLIENT_SECRET,
                authority=f"https://login.microsoftonline.com/{config.TENANT_ID}",
            )
        return self._app

    def _acquire_token(self) -> str:
        """Acquire (or return cached) access token for Graph API."""
        scopes = ["https://graph.microsoft.com/.default"]
        app = self._get_app()

        # Try cache first
        result = app.acquire_token_silent(scopes, account=None)
        if result and "access_token" in result:
            self._token = result["access_token"]
            return self._token

        # Fresh acquisition
        result = app.acquire_token_for_client(scopes=scopes)
        if "access_token" not in result:
            error = result.get("error_description", result.get("error", "unknown"))
            raise RuntimeError(f"MSAL token acquisition failed: {error}")
        self._token = result["access_token"]
        return self._token

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._acquire_token()}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------
    # Drive / item resolution
    # ------------------------------------------------------------------

    def _resolve_file(self) -> tuple[str, str]:
        """Return (driveId, itemId) for the configured SharePoint file."""
        if self._drive_id and self._item_id:
            return self._drive_id, self._item_id

        if not config.FILE_URL:
            raise RuntimeError(
                "SHAREPOINT_FILE_URL not configured. "
                "Set it in .env to enable Excel sync."
            )

        token = _encode_share_url(config.FILE_URL)
        url = f"{GRAPH_BASE}/shares/{token}/driveItem"

        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers=self._headers())
            self._raise_for_status(resp, "resolve share URL")
            data = resp.json()

        # parentReference.driveId + id
        self._drive_id = data["parentReference"]["driveId"]
        self._item_id = data["id"]
        logger.info(
            "Resolved SharePoint file: driveId=%s itemId=%s",
            self._drive_id,
            self._item_id,
        )
        return self._drive_id, self._item_id

    def _workbook_url(self, path: str) -> str:
        drive_id, item_id = self._resolve_file()
        return f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/workbook/{path}"

    # ------------------------------------------------------------------
    # Error handling
    # ------------------------------------------------------------------

    @staticmethod
    def _raise_for_status(response: httpx.Response, context: str = "") -> None:
        if response.status_code >= 400:
            try:
                body = response.json()
                msg = body.get("error", {}).get("message", response.text)
            except Exception:
                msg = response.text
            label = f" [{context}]" if context else ""
            raise RuntimeError(
                f"Graph API error{label} {response.status_code}: {msg}"
            )

    # ------------------------------------------------------------------
    # Table helpers
    # ------------------------------------------------------------------

    def get_table_headers(self, table_name: str) -> list[str]:
        """Return the list of column header names for *table_name*."""
        url = self._workbook_url(f"tables/{table_name}/columns")
        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers=self._headers())
            self._raise_for_status(resp, f"get headers {table_name}")
            data = resp.json()
        return [col["name"] for col in data.get("value", [])]

    def get_table_rows(self, table_name: str) -> list[dict[str, Any]]:
        """
        Return all rows from *table_name* as a list of dicts.

        Each dict has the column headers as keys plus a ``_row_index`` key
        (0-based) that is required for PATCH operations.
        """
        headers = self.get_table_headers(table_name)
        rows: list[dict[str, Any]] = []
        skip = 0

        with httpx.Client(timeout=60) as client:
            while True:
                url = self._workbook_url(
                    f"tables/{table_name}/rows"
                    f"?$top={_PAGE_SIZE}&$skip={skip}"
                )
                resp = client.get(url, headers=self._headers())
                self._raise_for_status(resp, f"get rows {table_name}")
                data = resp.json()
                batch = data.get("value", [])
                if not batch:
                    break
                for row in batch:
                    values: list[Any] = row.get("values", [[]])[0]
                    row_dict = {
                        headers[i]: (values[i] if i < len(values) else None)
                        for i in range(len(headers))
                    }
                    row_dict["_row_index"] = row.get("index", skip + len(rows))
                    rows.append(row_dict)
                if len(batch) < _PAGE_SIZE:
                    break
                skip += _PAGE_SIZE

        return rows

    def update_table_row(
        self,
        table_name: str,
        row_index: int,
        values_dict: dict[str, Any],
        headers: list[str] | None = None,
    ) -> None:
        """PATCH a single row in *table_name* by its 0-based *row_index*."""
        if headers is None:
            headers = self.get_table_headers(table_name)

        values_list = [values_dict.get(h, "") for h in headers]
        url = self._workbook_url(
            f"tables/{table_name}/rows/itemAt(index={row_index})"
        )
        payload = {"values": [values_list]}

        with httpx.Client(timeout=30) as client:
            resp = client.patch(url, headers=self._headers(), json=payload)
            self._raise_for_status(resp, f"update row {table_name}[{row_index}]")

    def add_table_row(
        self,
        table_name: str,
        values_dict: dict[str, Any],
        headers: list[str] | None = None,
    ) -> None:
        """Append a new row to *table_name*."""
        if headers is None:
            headers = self.get_table_headers(table_name)

        values_list = [values_dict.get(h, "") for h in headers]
        url = self._workbook_url(f"tables/{table_name}/rows/add")
        payload = {"values": [values_list]}

        with httpx.Client(timeout=30) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            self._raise_for_status(resp, f"add row {table_name}")


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

graph = GraphClient()
