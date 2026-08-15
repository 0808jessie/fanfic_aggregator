# 純 HTTP 靜態 Adapter 修復驗證

| 來源 | 實作結果 | 單一來源實測 |
| --- | --- | --- |
| Penana | 移除所有 Playwright 匯入、`page.goto` 與 detail-page browser 導覽。僅以 `requests.get`、BeautifulSoup 與 `(connect=2s, read=4s)` 有界 HTTP 請求解析搜尋卡與官方標題列總數。 | 上游回傳 HTTP 403 時於 **3,769 ms** 以來源級 blocked 狀態回應。 |
| AO3 | 保留同頁 requests + BeautifulSoup 搜尋／heading 解析。靜態頁不提供可驗證標記時直接回傳來源級警示，無 browser fallback。 | HTTP 525 於 **4,468 ms** 以 blocked 狀態回應。 |
| 在水裡寫字 | 移除 rendered fallback 與 page.goto。驗證、冷卻、HTTP 錯誤與無可驗證標記均安全回傳空結果與來源警示。 | HTTP 讀取逾時於 **2,066 ms** 回應 error；未阻塞其他來源。 |

## 不變契約

- AO3、Penana、在水裡寫字的卡片與官方總數仍從同一份搜尋 HTML 解析。
- 平台聚合的來源級 8 秒 deadline、錯誤隔離、快取與單一平台重試均未改動。
- 原始碼掃描確認三個 Adapter 不含 `page.goto`、`sync_playwright`、`PLAYWRIGHT_AVAILABLE` 或 `configure_fast_page`。

## 回歸

- 純 HTTP Adapter 重點測試：**29 passed**。
- 全套 Python：**65 passed**。
- TypeScript：通過。
- Vitest：**41 passed**。
