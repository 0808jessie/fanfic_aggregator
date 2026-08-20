"""TLS certificate bootstrap shared by development and the PyInstaller sidecar."""

from __future__ import annotations

import os
from pathlib import Path

import certifi


def configure_tls_certificates() -> str:
    """Force every HTTP stack to use certifi's bundle, including onefile extraction."""
    certificate_path = certifi.where()
    if not Path(certificate_path).is_file():
        raise RuntimeError(f"certifi CA bundle is unavailable: {certificate_path}")
    for variable in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"):
        os.environ[variable] = certificate_path
    return certificate_path
