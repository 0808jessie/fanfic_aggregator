# Fanfic Atlas 最終驗證紀錄

## 2026-08-12 預覽驗證

使用瀏覽器預覽頁搜尋「星光」：FastAPI / tRPC 代理成功取得 20 筆 AO3 真實作品，畫面標示 `AO3 [live]`，作品連結均指向 `https://archiveofourown.org/works/...`；未出現 Example Domain。

使用瀏覽器預覽頁搜尋 `__fanfic_atlas_no_match_2026_zzzz__`：請求完成後畫面顯示 `00 STORIES FOUND`、`DISCOVERY HALTED`、`目前無法取得外部作品索引。`，並呈現後端 warning：`未從 AO3, LOFTER 取得可驗證作品。外部平台可能回傳 HTTP 403/404/429/525、觸發反爬防護或發生網路逾時；本次沒有使用任何佔位連結。`

## 自動化驗證

- `pnpm check`：通過，TypeScript 無錯誤。
- `pnpm test`：通過，3 個 test files、6 個 tests。
- `pnpm build`：通過，Vite production build 與 server bundle 均完成。
- 直接 FastAPI smoke test：回傳 `{ items: [], source: "none", warning: ... }`，且不含 `example.com`。
- tRPC 端到端 smoke test：FastAPI envelope 可由 Node 代理完整穿透，且不含 `example.com`。

## 2026-08-22 Pages API origin 修正後預覽檢查

- Manus 預覽網址回應 HTTP 200，頁面標題為 `Fanfic Atlas — 跨平台同人探索`；受管理開發服務日誌同時確認 FastAPI `/api/health` 回應 200。
- 瀏覽器擷取工具未能上傳該次畫面且未列出互動 DOM，因此不將空白擷取畫面視為應用程式錯誤；本輪以完整 PWA／FastAPI／Tauri 回歸及靜態 Pages 注入產物驗證作為主要依據。
