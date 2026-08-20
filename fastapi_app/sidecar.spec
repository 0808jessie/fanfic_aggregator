# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller contract for the FastAPI desktop Sidecar.

The certifi data file is explicit: onefile bundles otherwise omit the CA bundle
used by requests and curl_cffi after extraction on macOS and Windows.
"""

from pathlib import Path

import certifi
from PyInstaller.utils.hooks import collect_all


PROJECT_ROOT = Path(SPECPATH).parent
FASTAPI_ROOT = PROJECT_ROOT / "fastapi_app"
curl_datas, curl_binaries, curl_hiddenimports = collect_all("curl_cffi")
datas = list(curl_datas) + [(certifi.where(), "certifi")]
binaries = list(curl_binaries)
hiddenimports = list(curl_hiddenimports) + ["certifi"]

a = Analysis(
    [str(FASTAPI_ROOT / "entrypoint.py")],
    pathex=[str(FASTAPI_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="api-server",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
