# Render FastAPI 部署

本檔案讓 Render 將 `fastapi_app/` 作為單一 Python Web Service 部署；React PWA 仍部署於 Cloudflare Pages，而 Cloudflare Worker 只會把 API request 轉發到這個 Render HTTPS origin。

> Render Free Web Service 閒置 15 分鐘會休眠；下一個請求會喚醒服務，官方說明約需一分鐘。因此它適合測試與個人使用，但不等於真正 24/7、零冷啟動後端。[1]

## 3 分鐘點擊部署

| Render 表單欄位 | 值 |
| --- | --- |
| Service type | `Web Service` |
| Runtime | `Python` |
| Instance type | `Free` |
| Root directory | `fastapi_app` |
| Build command | `pip install -r requirements.txt` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health check path | `/api/health` |

1. 將本專案 `main` 推送至 GitHub 後，登入 [Render Dashboard](https://dashboard.render.com)，按 **New → Blueprint**，連結 `0808jessie/fanfic_aggregator`，選擇 `main`，確認偵測到根目錄的 `render.yaml`，再按 **Deploy Blueprint**。Render Blueprint 會建立其中定義的 Python Web Service。[2]
2. 部署完成後，複製 Render 顯示的 `https://fanfic-atlas-fastapi.onrender.com` 類型網址，並開啟 `https://你的-render網域/api/health`；預期回應 HTTP 200。
3. 回到 Cloudflare Worker，在 **Settings → Variables and Secrets** 將 `API_ORIGIN` 設為這個 Render HTTPS 網址的**網域根**，不加 `/api`。例如：`https://fanfic-atlas-fastapi.onrender.com`。重新部署 Worker。
4. Cloudflare Pages 維持 `VITE_API_BASE_URL=https://你的-worker.workers.dev`，重新部署 Pages。手機 PWA 的搜尋即依序走 Pages → Worker → Render FastAPI。

PWA、Worker 與 Render FastAPI 的方法契約固定為：`/api/search` 與 `/api/reader` 使用 JSON `POST`；瀏覽器的 CORS 預檢使用 `OPTIONS`，由 FastAPI CORS middleware 與 Worker 直接回應。Worker 將保留原始 JSON body，並以 `POST` 轉發到 Render。請勿以瀏覽器網址列直接開啟這兩個端點，因為那會發出 `GET` 並正確得到 HTTP 405。

```mermaid
flowchart LR
  P[手機 PWA：Cloudflare Pages] --> W[Cloudflare Worker]
  W --> R[Render FastAPI]
  R --> S[公開小說來源]
```

## 重要限制與安全設定

Render Free 服務的本機檔案系統在重啟、重新部署或休眠後不保留資料；本 Blueprint 因此將暫存 SQLite 設於 `/tmp/fanfic.db`。這只會清空搜尋快取，不影響即時搜尋能力；若日後需要持久化資料，應改用外部資料庫。Render 也明確不建議把 Free instance 當作生產服務。[1]

`CORS_ALLOW_ORIGINS` 預設為 `*`，確保 Cloudflare Pages／Worker 與 PWA 可連線。若已固定你的 Pages 網域，可在 Render Environment 改為逗號分隔的 allowlist，例如 `https://fanfic-atlas.pages.dev,https://app.example.com`，再手動重新部署。Cloudflare Worker 仍只會代理 `/api/search` 與 `/api/reader`，並不會繞過第三方來源的登入、驗證或付費保護。

## 參考資料

[1] [Render Free Web Services](https://render.com/docs/free)

[2] [Render Blueprints](https://render.com/docs/infrastructure-as-code)
