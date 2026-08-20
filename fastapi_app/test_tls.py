"""Regression coverage for the desktop Sidecar certificate contract."""

from pathlib import Path
import sys

import pytest

APP_ROOT = Path(__file__).resolve().parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

import tls


def test_onefile_runtime_prefers_the_explicitly_bundled_certifi_file(tmp_path, monkeypatch):
    bundled_certificate = tmp_path / "certifi" / "cacert.pem"
    bundled_certificate.parent.mkdir()
    bundled_certificate.write_text("bundled CA", encoding="utf-8")
    fallback_certificate = tmp_path / "fallback.pem"
    fallback_certificate.write_text("fallback CA", encoding="utf-8")
    monkeypatch.setattr(tls.sys, "_MEIPASS", str(tmp_path), raising=False)
    monkeypatch.setattr(tls.certifi, "where", lambda: str(fallback_certificate))

    resolved = tls.configure_tls_certificates()

    assert resolved == str(bundled_certificate)
    assert tls.os.environ["SSL_CERT_FILE"] == resolved
    assert tls.os.environ["REQUESTS_CA_BUNDLE"] == resolved
    assert tls.os.environ["CURL_CA_BUNDLE"] == resolved


def test_onefile_runtime_falls_back_to_certifi_when_the_extraction_file_is_missing(tmp_path, monkeypatch):
    fallback_certificate = tmp_path / "fallback.pem"
    fallback_certificate.write_text("fallback CA", encoding="utf-8")
    monkeypatch.setattr(tls.sys, "_MEIPASS", str(tmp_path / "missing-extraction"), raising=False)
    monkeypatch.setattr(tls.certifi, "where", lambda: str(fallback_certificate))

    assert tls.configure_tls_certificates() == str(fallback_certificate)


def test_tls_configuration_fails_clearly_when_no_ca_bundle_exists(tmp_path, monkeypatch):
    monkeypatch.setattr(tls.sys, "_MEIPASS", str(tmp_path / "missing-extraction"), raising=False)
    monkeypatch.setattr(tls.certifi, "where", lambda: str(tmp_path / "missing.pem"))

    with pytest.raises(RuntimeError, match="certifi CA bundle is unavailable"):
        tls.configure_tls_certificates()


def test_sidecar_spec_and_entrypoint_preserve_the_onefile_certificate_contract():
    app_root = Path(__file__).resolve().parent
    spec_source = (app_root / "sidecar.spec").read_text(encoding="utf-8")
    entrypoint_source = (app_root / "entrypoint.py").read_text(encoding="utf-8")

    assert '[(str(CERTIFI_BUNDLE), "certifi")]' in spec_source
    assert "sys._MEIPASS/certifi/cacert.pem" in spec_source
    assert "import sys" in entrypoint_source
    assert 'os.environ.get("FANFIC_SIDECAR_PORT", "8000")' in entrypoint_source
