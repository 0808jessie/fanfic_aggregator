# FastAPI 服務恢復驗證

## 根因與修復

前端顯示「搜尋服務暫時無法連線」的直接原因是 **8000 埠沒有 FastAPI 程序監聽**；tRPC 代理當時對 `http://localhost:8000/search` 的連線被拒絕，因此依約回傳全域不可達保底訊息。

現已新增 `server/fastapiService.ts` 監督器，Node/tRPC 服務啟動時會：

1. 檢查 8000 埠是否已有健康的 `/fastapi-status` 回應；
2. 若服務不存在，從 `fastapi_app/` 以 `python3 -m uvicorn main:app --host 0.0.0.0 --port 8000` 啟動；
3. 最多等待 5 秒健康檢查，並在 Node 結束時終止其擁有的子程序。

## 實測

| 驗證 | 結果 |
| --- | --- |
| 停止既有 8000 程序後重啟 Node 開發服務 | 監督器成功啟動 FastAPI，Python 程序監聽 `0.0.0.0:8000`。 |
| `GET /fastapi-status` | 回傳 `{"status":"ok","service":"fastapi-search","version":"0.1.4"}`。 |
| 直接 `POST /search`（CxC／蛇戀） | 回傳已驗證作品 JSON。 |
| tRPC `fastapi.proxy` → `/fastapi-status` | 回傳 200。 |
| tRPC `fastapi.proxy` → `/search`（CxC／蛇戀） | 回傳 `success: true`、`platformId: cxc`、`status: success` 與真實作品。 |

## 回歸

- Python：**71 passed**。
- Vitest：**43 passed**。
- TypeScript：通過。
