# AO3 與 Penana 安全可用性調整驗證

## AO3

- CP／題材轉譯仍保留於詞庫與 UI，但即時 AO3 搜尋遇到含引號、`OR` 或 `AND` 的布林字串時，一律送出使用者原始單一關鍵字。
- 對 HTTP 503、525 或 `requests` 暫時例外，僅在時間預算允許時等待 **600 ms** 後重試一次；第二次仍失敗則回傳來源級狀態。
- 成人偏好 Cookie 與公開搜尋標頭維持不變。

## Penana

- 不使用公開代理或人機保護規避。
- Penana 來源狀態為 `blocked` 且已有查詢字詞時，前端狀態卡會顯示「**在 Penana 官網搜尋**」新分頁連結，網址使用 `https://www.penana.com/search?t=story&search=<keyword>`。
- 該連結會停止卡片點擊事件傳遞，因此不會改變目前的來源篩選或觸發全域搜尋；既有「重試 Penana」仍只送出 `platforms: ["penana"]` 與 `forceRefresh: true`。

## 回歸

- AO3 暫時 525 後成功恢復與第二次 525 降級均有單元測試。
- Penana 官方搜尋連結與 AO3／Penana 單一來源重試均有前端測試。
- Python：**72 passed**；Vitest：**44 passed**；TypeScript：通過。
