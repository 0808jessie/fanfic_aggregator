import os
import sys
from pathlib import Path

import certifi

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers import ao3_scraper
from tls import configure_tls_certificates


def test_tls_bootstrap_uses_certifi_for_requests_and_curl_cffi():
    bundle = configure_tls_certificates()

    assert Path(bundle).is_file()
    assert bundle == certifi.where()
    assert os.environ["SSL_CERT_FILE"] == bundle
    assert os.environ["REQUESTS_CA_BUNDLE"] == bundle
    assert os.environ["CURL_CA_BUNDLE"] == bundle


def test_ao3_module_exposes_its_curl_cffi_requests_dependency():
    assert hasattr(ao3_scraper.requests, "Session")
