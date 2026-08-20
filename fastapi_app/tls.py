"""TLS certificate bootstrap shared by development and the PyInstaller sidecar."""

from __future__ import annotations

import os
from pathlib import Path
import sys

import certifi


def _bundled_certificate_path() -> Path | None:
    """Return the explicitly bundled CA file when running a PyInstaller onefile app."""
    extraction_root = getattr(sys, "_MEIPASS", None)
    if not extraction_root:
        return None
    candidate = Path(extraction_root) / "certifi" / "cacert.pem"
    return candidate if candidate.is_file() else None


def configure_tls_certificates() -> str:
    """Force every HTTP stack to use certifi's bundle, including onefile extraction.

    ``certifi.where()`` can point at a stale onefile extraction path after a
    desktop update. Prefer the data file explicitly placed in PyInstaller's
    ``certifi/`` folder, then retain certifi's normal path as a safe fallback.
    """
    certificate_file = _bundled_certificate_path() or Path(certifi.where())
    if not certificate_file.is_file():
        raise RuntimeError(f"certifi CA bundle is unavailable: {certificate_file}")
    certificate_path = str(certificate_file)
    for variable in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ[variable] = certificate_path
    return certificate_path
