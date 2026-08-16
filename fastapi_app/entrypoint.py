from __future__ import annotations
import sys
import os
import uvicorn

# 確保模組搜尋路徑正確，以便打包後能順利載入主程式與 scrapers
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from main import app

if __name__ == "__main__":
    # 監聽本地 127.0.0.1:8000，供 Tauri 桌面前端請求
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
