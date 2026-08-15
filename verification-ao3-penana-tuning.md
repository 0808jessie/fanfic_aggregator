# AO3 與 Penana 最後調優驗證

## AO3

| 項目 | 調整結果 |
| --- | --- |
| 專屬來源期限 | 聚合層保留其他來源 **6.5 秒**快速隔離，但 AO3 使用 **10 秒**來源 deadline。 |
| 請求設定 | 連線 5 秒、讀取 10 秒；保留 Chrome 124、完整 Accept／語系與 `view_adult=true; accepted_tos=2018`。 |
| 查詢降級 | 當 AO3 的轉譯布林字串超過 220 字元時，以使用者原詞送往 `work_search[query]`，避免過長語法拖慢公開搜尋。 |

以「蛇戀」透過 tRPC → Unix socket → FastAPI 實測，AO3 回傳 **success**，耗時 **3,211 ms**。

## Penana

Penana 公開 Finder 請求已加入 Chrome client-hint／navigation 相容標頭（`Sec-CH-UA`、`Sec-Fetch-*`），並保留既有桌面 User-Agent、語系與 Referer。此變更不規避或嘗試破解 Cloudflare；HTTP 403／驗證頁會安全回傳來源級 **blocked** 與單獨重試入口。

同一輪「蛇戀」實測中，Penana 回應 HTTP 403，於 **2,199 ms** 正確呈現 `blocked`，沒有影響其他來源或 Unix socket 代理。

## 回歸

- Python：**71 passed**。
- Vitest：**43 passed**。
- TypeScript：通過。
