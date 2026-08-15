# AO3 與 Penana 防護升級驗證

## 實作結果

| Adapter | 強化內容 | 來源級安全行為 |
| --- | --- | --- |
| AO3 | HTTP 請求使用 Chrome 124、完整 Accept／語系標頭、`view_adult=true; accepted_tos=2018` 偏好 Cookie；對 503、525 與暫時性網路錯誤僅重試一次，等待 1 秒。 | 請求共用 **6.5 秒** 靜態 HTTP 時間預算；保護頁與最終失敗直接回傳來源級 warning，沒有 browser fallback。 |
| Penana | 維持有界 HTTP/HTML 解析；403、520–522、525 與驗證頁明確標記為「觸發人機保護」。 | 不以 stealth 或 browser automation 規避 Cloudflare。聚合層據此顯示 blocked 與指定來源的重試按鈕。 |
| 前端 | 既有 `retrySinglePlatform` 仍執行 `preventDefault()`、`stopPropagation()`，並以 `platforms: [platform]` 和 `forceRefresh: true` 發送請求。 | AO3 與 Penana 的重試各自只請求該來源，並保留其他來源結果。 |

## 實測與回歸

- AO3 目前上游逾時時，完成一次有界重試並於 **3,126 ms** 回傳來源級 error。
- Penana 上游目前逾時時，於 **2,054 ms** 回傳來源級 error；若收到 403／驗證頁則會回報 blocked／「觸發人機保護」。
- 針對 AO3／Penana 的 Adapter 與單一重試測試：Python **32 passed**，首頁測試 **11 passed**。
- 全套回歸：Python **67 passed**、Vitest **42 passed**、TypeScript 通過。
