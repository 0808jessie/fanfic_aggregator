# Penana 簡化公開搜尋驗證

## 實作

- 搜尋請求縮減為 `GET https://www.penana.com/search?t=story&search=<keyword>`，移除 `genre`、`filter`、`rating_multiple` 等非必要 Finder 篩選參數。
- 保留公開頁解析所需的桌面 User-Agent、Accept、語系、Referer、keep-alive、Upgrade-Insecure-Requests 與導航相容標頭。
- 請求採 **3 秒連線／8 秒讀取**；卡片解析仍驗證標題、作者、官方作品 URL、摘要與封面相容欄位。
- 403 或 Cloudflare 驗證頁仍回傳來源級 `blocked`，保留單獨重試，不產生未驗證作品或全域服務錯誤。

## 公開端點實測（義忍）

| URL | 回應 | 耗時 |
| --- | --- | --- |
| `/search?search=義忍` | HTTP 403 | 2,330 ms |
| `/search?t=story&search=義忍` | HTTP 403 | 2,674 ms |

透過 tRPC → Unix socket → FastAPI 的單一 Penana 搜尋也於 **2,292 ms** 回傳 `blocked`。因此，簡化 URL 與標準公開標頭已正確套用，但目前該來源仍對本執行環境的公開 HTTP 請求啟用 Cloudflare 保護；本輪未使用或加入任何規避措施。

## 回歸

- Penana 針對性測試：**7 passed**。
- 全套 Python：**71 passed**。
- Vitest：**43 passed**。
- TypeScript：通過。
