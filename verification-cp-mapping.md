# AO3 CP Relationship Search & Automatic Fallback Verification

本文件記錄 Fanfic Atlas 針對 AO3 CP（配對）搜尋精準度提升與受控自動降級機制的驗證結果。

## 1. 核心架構調整
- **參數修正**：將 AO3 關聯標籤搜尋由舊版的 `tag_names` 升級為專門處理配對關係的 **`relationship_names`**，確保如 `Tomioka Giyuu/Kochou Shinobu` 的斜線組合標籤能精準對應。
- **常數模組化**：將 CP 對照字典獨立至 `fastapi_app/constants/cp_tags.py`，支援：
  - `義忍` -> `Tomioka Giyuu/Kochou Shinobu`
  - `五夏` -> `Gojo Satoru/Geto Suguru`
  - `夏五` -> `Geto Suguru/Gojo Satoru`
  - `勝出` -> `Bakugou Katsuki/Midoriya Izuku`
  - `轟出` -> `Todoroki Shouto/Midoriya Izuku`
- **自動降級 (Fallback Search)**：當輸入已知 CP 縮寫（如「義忍」）但 `relationship_names` 查詢回傳 0 筆或遭遇防護阻擋時，系統將自動啟動受控降級，改用通用 `work_search[query]=義忍` 再次請求，確保不回傳空白頁面或未處理的異常錯誤。

## 2. 測試覆蓋狀況
- **Python 單元與整合測試 (`fastapi_app/test_ao3_mapping.py`)**：
  1. `test_cp_tag_map_constants`：驗證常數對應。
  2. `test_matches_expected_relationship`：驗證斜線配對模糊與精準比對邏輯。
  3. `test_ao3_tag_parser_separates_relationships_and_characters`：驗證 HTML 解析器能正確區分 `relationships` 與 `characters` 標籤。
  4. `test_relationship_names_url_construction_logic`：驗證 URL 建構使用 `relationship_names` 且無 `tag_names`。
  5. `test_ao3_scraper_triggers_fallback_when_relationship_returns_zero`：驗證當 relationship 模式回傳 0 筆作品時，確實自動呼叫 `_fallback_query_search`。
- **前端與代理測試**：Vitest 14 項測試全數通過（涵蓋 tRPC 代理 envelope、搜尋結果去重、UI 互動與載入狀態）。

## 2026-08-12 義忍與 Fallback 驗證紀錄
預覽頁可正常輸入「義忍」並送出搜尋；搜尋送出後畫面進入 `SCANNING ARCHIVES...`。後端日誌與測試確認 AO3 URL 已採用 `work_search[relationship_names]=Tomioka Giyuu/Kochou Shinobu`；當首輪查詢未命中或遇防護時，會自動觸發 `_fallback_query_search`，確保系統穩定回應。

## 2026-08-13 多平台轉譯與連線狀態驗證

本次將 CP 轉譯改為平台感知模型。輸入「義忍」時，AO3 會收到 `"Tomioka Giyuu/Kochou Shinobu" OR "義忍"`，而在水裡寫字與同人誌中心會各自收到 `義忍 富岡義勇 胡蝶忍`。每個 Adapter 的回應都會含有 `platformId`、`status`、`itemCount` 與 `translatedQuery`，前端可僅對 `blocked`、`cooldown` 或 `error` 來源顯示「重試」操作。

全套 Python 測試（38 項）、Vitest（31 項）與 TypeScript 型別檢查均已通過。實際以義忍對 AO3、同人誌中心及在水裡寫字發送公開搜尋時，服務正確回傳了每個平台的轉譯查詢字串與安全的 `error` 狀態；沒有建立任何佔位或未驗證作品資料。

同日的獨立瀏覽器檢查顯示 AO3 的上游 Cloudflare 頁面回傳 HTTP 525「SSL handshake failed」，並明確標示瀏覽器與 Cloudflare 正常、來源主機錯誤。因此，當次實際 AO3 結果無法作為成功資料驗證；此為當下外部主機可用性限制，狀態列與單一來源重試正是用來呈現並處理此類情況。待 AO3 恢復可用後，需再以同一實際義忍請求確認 live 結果。
