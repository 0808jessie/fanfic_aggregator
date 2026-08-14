# 搜尋逾時緊急修復驗證

## 根因

所有來源同時顯示逾時並非五個 Adapter 同時失敗。開發日誌顯示 tRPC 代理對 `http://localhost:8000/search` 的連線錯誤，且 8000 埠沒有監聽程序。重啟時另外發現重置環境缺少 SQLAlchemy 與 Playwright Chromium 執行檔；兩者皆已恢復。

## 修復措施

| 層級 | 修復 |
| --- | --- |
| 搜尋來源 | 平行 registry 以 **8 秒** deadline 收集已完成來源；逾時來源輸出 `error`、`itemCount: 0` 與「連線逾時」警示，不等待背景來源結束。 |
| API 入口 | 自訂 CP payload 接受 JSON 字串／列表／物件；解析或個別 mapping 無效時安全略過並使用系統預設。 |
| 代理 | tRPC → FastAPI deadline 改為 **10 秒**；FastAPI 不可達時 `/search` 回傳各已選來源的可重試狀態，而非全域 500。 |
| Adapter 等待 | AO3 與 Penana 搜尋頁 navigation 限制為 7 秒、卡片 selector 限制為 2 秒；Penana 不再為可選詳情額外導覽，卡片與總數均由同一次搜尋頁載入解析。 |
| 可觀測性 | 日誌新增 `[Search Start]`、`[平台 Done in ms]`、`[Search Aggregate Done in ms]` 與代理耗時。 |

## 實測

以五來源關鍵字「鬼滅」呼叫本機 FastAPI，回應時間為 **8,079 ms**。CxC 在 **3,564 ms** 完成並回傳驗證結果；AO3、同人誌中心、在水裡寫字與 Penana 在 deadline 後個別標示逾時，整體仍以 `source: live` 回傳已完成來源，而未全域失敗。

## 回歸

- Python：`pytest -q fastapi_app/test_*.py` → **56 passed**。
- TypeScript：`pnpm exec tsc --noEmit` → **passed**。
- Vitest：`pnpm vitest run` → **36 passed**。
