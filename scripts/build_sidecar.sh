#!/usr/bin/env bash
set -e

echo "=== Building FastAPI Sidecar with PyInstaller ==="
python3 -c "import PyInstaller, curl_cffi, fastapi, uvicorn" || {
  echo "Missing packaging dependencies. Run: sudo pip3 install pyinstaller -r fastapi_app/requirements.txt" >&2
  exit 1
}

python3 -m PyInstaller --noconfirm --clean --onefile --name "api-server" \
  --paths "fastapi_app" \
  --collect-all curl_cffi \
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
    chmod +x src-tauri/binaries/api-server-$TRIPLE
elif [ "$OS" = "Linux" ]; then
    TRIPLE="x86_64-unknown-linux-gnu"
    cp dist/api-server src-tauri/binaries/api-server-$TRIPLE
    chmod +x src-tauri/binaries/api-server-$TRIPLE
else
    # Windows git bash
    cp dist/api-server.exe src-tauri/binaries/api-server-x86_64-pc-windows-msvc.exe
fi

echo "Successfully built and copied sidecar binary to src-tauri/binaries/"
ls -la src-tauri/binaries/
