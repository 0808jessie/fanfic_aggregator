# Adapter 管理與詞庫 UI 驗證紀錄

| 項目 | 驗證結果 |
| --- | --- |
| Lofter 停用 | 已自後端 `SCRAPERS`、`/platforms`、前端預設來源、篩選器、狀態卡與引導文案移除。首頁實際預覽顯示 `AO3 + DOUJIN + WATERWRITER + PENANA + CXC`。 |
| 官方總數 | AO3 保留 `view_adult=true` Cookie 與 `h2.heading` 正則；水裡寫字改以 CP 主詞並解析 `共檢索到 N 篇主題`；Penana 新增搜尋標題列總數；同人誌中心強化結果標頭／分頁解析。聚合層不再將首頁卡片數偽裝為官方總數。 |
| CP 詞庫 | `sui-read-custom-cp-map` 儲存自訂 AO3／本地雙查詢，支援舊 key 遷移、系統預設合併、覆寫、刪除與重設。自訂對照會隨搜尋請求傳至 FastAPI，並以指紋隔離快取。 |
| 快捷篩選 | ADAPTER CONNECTIONS 卡片可點擊、支援 Enter／Space、顯示 active 亮框、再次點擊恢復全部，另提供 `ALL / 全部` 控制；重試按鈕停止事件傳遞。 |

## 回歸結果

- Python：`pytest -q fastapi_app/test_*.py` → **54 passed**。
- 前端：`pnpm exec tsc --noEmit` → **passed**；`pnpm vitest run` → **35 passed**。
- 預覽：首頁工程網格版面與五個啟用來源摘要正常顯示，未再出現 Lofter。
