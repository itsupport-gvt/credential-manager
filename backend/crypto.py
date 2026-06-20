"""
crypto.py – Fernet field-level encryption for sensitive credential values.

If ENCRYPTION_KEY is missing from the environment the module auto-generates a
new key, writes it to the .env file, and updates the live config so the rest
of the process uses the correct key without a restart.
"""

from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

import config


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_fernet_instance: Fernet | None = None


def _write_key_to_env(key: str) -> None:
    """Persist a newly generated key to the .env file."""
    env_path: Path = config.ENV_PATH
    if env_path.exists():
        text = env_path.read_text(encoding="utf-8")
        if "ENCRYPTION_KEY=" in text:
            lines = []
            for line in text.splitlines():
                if line.startswith("ENCRYPTION_KEY="):
                    lines.append(f"ENCRYPTION_KEY={key}")
                else:
                    lines.append(line)
            env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        else:
            with env_path.open("a", encoding="utf-8") as fh:
                fh.write(f"\nENCRYPTION_KEY={key}\n")
    else:
        env_path.write_text(f"ENCRYPTION_KEY={key}\n", encoding="utf-8")


def get_fernet() -> Fernet:
    """Return the singleton Fernet instance, generating a key if necessary."""
    global _fernet_instance  # noqa: PLW0603

    if _fernet_instance is not None:
        return _fernet_instance

    key = config.ENCRYPTION_KEY.strip()

    if not key:
        # Generate a new URL-safe base64-encoded 32-byte key
        key = Fernet.generate_key().decode()
        # Persist to .env
        _write_key_to_env(key)
        # Update the live config module so other imports see it immediately
        config.ENCRYPTION_KEY = key
        os.environ["ENCRYPTION_KEY"] = key

    _fernet_instance = Fernet(key.encode())
    return _fernet_instance


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_encrypted(value: str) -> bool:
    """Return True if *value* looks like a Fernet-encrypted token.

    Fernet tokens are URL-safe base64 strings.  When the raw version byte
    (0x80) is the first byte, the base64-encoded string always starts with
    'gAAAAAB'.  We check the string directly — no need to decode.
    """
    return bool(value) and value.startswith("gAAAAA") and len(value) > 50


def encrypt(value: str) -> str:
    """Encrypt *value* with Fernet.  Returns '' for empty input."""
    if not value:
        return ""
    token: bytes = get_fernet().encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt(value: str) -> str:
    """
    Decrypt *value*.

    - Returns '' for empty input.
    - If *value* is not a valid Fernet token (e.g. plain-text imported from
      Excel) it is returned as-is so callers always get a usable string.
    - Any other decryption error is swallowed and '' is returned.
    """
    if not value:
        return ""
    if not is_encrypted(value):
        return value
    try:
        return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except (InvalidToken, Exception):
        return ""
