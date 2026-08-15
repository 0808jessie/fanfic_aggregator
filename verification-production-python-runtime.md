# 生產部署 Python Runtime 修復驗證

## 根因

生產映像原本只有 Node.js。`server/fastapiService.ts` 啟動 sidecar 時執行 `python3 -m uvicorn`，容器內沒有 `python3`，觸發 `ENOENT`。子程序未處理的 `error` 事件使 Node 程序以 exit(1) 結束，因此 3000 埠 TCP health probe 失敗。

## 修復

| 項目 | 實作 |
| --- | --- |
| `Dockerfile` | 以 `node:22-slim` 為基底，安裝 `python3`、`python3-venv`、CA 憑證；於 `/opt/fastapi-venv` 建立虛擬環境。 |
| Python 依賴 | 新增 `fastapi_app/requirements.txt`，包含 FastAPI、Uvicorn、SQLAlchemy、Pydantic、Requests 與 BeautifulSoup。 |
| PATH | 生產容器將 `/opt/fastapi-venv/bin` 放在 `PATH` 前方，因此受控 sidecar 的 `python3` 可執行 Uvicorn。 |
| sidecar 防護 | 為子程序加入 `error` event handler；若 Python 缺失或執行失敗，Node 會記錄診斷而不因未處理事件退出。 |
| 公開埠 | Node 維持 3000；FastAPI 維持 Unix socket 內部通訊，不干擾啟動 TCP probe。 |

## 驗證

- 以 Dockerfile 相同的 `pnpm run build` 建置成功，並確認 `dist/index.js` 與 Python requirements 存在。
- Node 重啟後：3000 埠正常監聽、`.manus-fastapi.sock` 已就緒。
- tRPC → Unix socket：`/fastapi-status` 回傳 `status: ok`，CxC 單一來源搜尋回傳 `success`。
- TypeScript 通過；FastAPI 監督器／代理 Vitest 通過；Python **72 passed**。
