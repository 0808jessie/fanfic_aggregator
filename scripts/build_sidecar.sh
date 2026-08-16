#!/usr/bin/env bash
set -e

echo "=== Building FastAPI Sidecar with PyInstaller ==="

# 檢查虛擬環境或依賴
if ! command -v pyinstaller &> /dev/null; then
    echo "PyInstaller not found. Installing..."
    pip install pyinstaller uvicorn fastapi curl_cffi beautifulsoup4 httpx
fi

# 建立目標 binaries 目錄
mkdir -p src-tauri/binaries

# 根據系統決定 target triple 尾綴
UNAME_S="$(uname -s)"
UNAME_M="$(uname -m)"

if [ "$UNAME_S" = "Darwin" ]; then
    if [ "$UNAME_M" = "arm64" ]; then
        TARGET_TRIPLE="aarch64-apple-darwin"
    else
        TARGET_TRIPLE="x86_64-apple-darwin"
    fi
elif [ "$UNAME_S" = "Linux" ]; then
    TARGET_TRIPLE="x86_64-unknown-linux-gnu"
else
    TARGET_TRIPLE="x86_64-pc-windows-msvc"
fi

echo "Detected target triple: $TARGET_TRIPLE"

# 執行 PyInstaller 打包為單一執行檔
pyinstaller --noconfirm --onefile --name "api-server" \
  --paths "fastapi_app" \
  fastapi_app/entrypoint.py

# 搬移並重新命名為 Tauri 要求的帶 target triple 檔名
if [ -f "dist/api-server" ]; then
    cp "dist/api-server" "src-tauri/binaries/api-server-$TARGET_TRIPLE"
elif [ -f "dist/api-server.exe" ]; then
    cp "dist/api-server.exe" "src-tauri/binaries/api-server-$TARGET_TRIPLE.exe"
fi

echo "=== Sidecar build completed successfully! ==="
ls -lh src-tauri/binaries/
