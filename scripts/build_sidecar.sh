#!/usr/bin/env bash
set -e

echo "=== Building FastAPI Sidecar with PyInstaller ==="
pip install pyinstaller uvicorn fastapi curl_cffi beautifulsoup4 sqlalchemy pydantic

pyinstaller --noconfirm --onefile --name "api-server" \
  --paths "fastapi_app" \
  fastapi_app/entrypoint.py

mkdir -p src-tauri/binaries
# 依據當前平台決定 target triple 命名
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        TRIPLE="aarch64-apple-darwin"
    else
        TRIPLE="x86_64-apple-darwin"
    fi
    cp dist/api-server src-tauri/binaries/api-server-$TRIPLE
elif [ "$OS" = "Linux" ]; then
    TRIPLE="x86_64-unknown-linux-gnu"
    cp dist/api-server src-tauri/binaries/api-server-$TRIPLE
else
    # Windows git bash
    cp dist/api-server.exe src-tauri/binaries/api-server-x86_64-pc-windows-msvc.exe
fi

echo "Successfully built and copied sidecar binary to src-tauri/binaries/"
ls -la src-tauri/binaries/
