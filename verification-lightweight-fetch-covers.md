# 輕量來源解析、單一重試與封面防盜鏈驗證

| 項目 | 驗證結果 |
| --- | --- |
| 靜態來源優先 | AO3、在水裡寫字、同人誌中心以有界 `requests` + BeautifulSoup HTML 解析卡片與官方總數；Penana 維持已存在的輕量搜尋 GET。非終態不完整 HTML 才保留 browser fallback。 |
| AO3 防護降級 | AO3 靜態 GET 遇到 403／429／525、保護頁或網路逾時時，不再啟動第二次 browser 導覽；回傳來源級可重試警示。實測 HTTP 525／防護情境從約 8 秒降為 **3,850 ms**。 |
| 單一重試 | 首頁抽出 `retrySinglePlatform`，使用 `preventDefault()` 與 `stopPropagation()`；僅提交指定平台、強制刷新且不重設全域分頁。現有結果／狀態只替換指定來源。 |
| 封面防盜鏈 | 搜尋與閱讀清單統一使用 `BlueprintCover`：第三方圖床帶 `referrerPolicy="no-referrer"`、`loading="lazy"`；圖片失敗或沒有 URL 時改顯示 Blueprint fallback cover。 |
| 視覺 | 首頁截圖確認搜尋 dock 與作品探索工作區保持完整；封面 fallback 具獨立元件回歸測試。 |

## 回歸結果

- Python：**64 passed**。
- TypeScript：`pnpm exec tsc --noEmit` 通過。
- Vitest：**41 passed**。
- 目標測試：靜態 HTML／browser fallback、單一來源重試與封面 fallback 全數通過。
