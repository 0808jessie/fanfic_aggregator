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

### 2026-08-13 AO3 恢復後的實際成功驗證

AO3 公開搜尋頁恢復後，瀏覽器可顯示 `47 Found`。隨即以 FastAPI 對 `keyword="義忍"`、`platforms=["ao3"]`、`forceRefresh=true` 執行實測，回傳 `source="live"`、`success=true`、`totalWorks=47`、`platformStatuses[0].status="success"`、`itemCount=47`，且 `translatedQuery` 為 `"Tomioka Giyuu/Kochou Shinobu" OR "義忍"`。回應包含可驗證的 AO3 作品 URL，例如 `https://archiveofourown.org/works/69215346`；因此可確認外部主機恢復後，原始 CP 別名、AO3 OR 查詢、官方總筆數與平台狀態回傳的整條流程均正常。

### 2026-08-13 AO3 成人內容視圖與總數比對

最新 Adapter 會加入 `view_adult=true` Cookie 與 `with_real_author_name=1`，但不加入語言或完結限制。對同一義忍 OR 查詢，AO3 官方頁面 heading 顯示 `47 Found`；FastAPI 強制更新後也回傳 `totalWorks=47`，因此首頁來源 Badge 與 STORIES FOUND 會使用官網明示的總數，而不是僅以本次已渲染的前兩頁卡片數量計算。

### 2026-08-13 在水裡寫字全站總數比對

以 `srchtxt=義忍 富岡義勇 胡蝶忍`、`searchsubmit=yes` 與 `srchfid=all` 開啟公開 Discuz 搜尋頁時，網站將請求導向結果頁並顯示「找到『義忍 富岡義勇 胡蝶忍』相關內容 1 個」。Adapter 已同時支援此實際格式與「共檢索到 X 篇主題」格式，並優先回傳頁面明示總數，而非將目前畫面解析到的卡片數量誤當作全站總數。

FastAPI 強制更新同一在水裡寫字搜尋後回傳 `source="live"`、`totalWorks=1` 與 `platformStatuses[0].itemCount=1`，並包含可驗證的公開討論串 `tid=85140`，與 Discuz 公開頁的明示總數一致。同人誌中心當次公開頁顯示 CAPTCHA 保護且內容為未篩選書目，Adapter 因此維持安全空結果與可重試狀態，不將不相關卡片或猜測總數寫入回應。

同人誌中心於後續同一查詢的公開頁檢查仍未提供可解析內容，因此尚無法取得可信的搜尋頁總數。總數擷取器僅會在公開頁明示 `.search_result_info`、同類搜尋標頭或分頁總數時使用其值；在 CAPTCHA 或無結果內容情境下，系統維持 `blocked/error` 狀態與零筆可驗證資料，避免以站內未篩選書目填充搜尋結果。

最新版 FastAPI 的同人誌中心單一來源強制更新同樣在頁面導覽逾時時回傳 `items=[]`、`totalWorks=0` 與 `platformStatuses[0].status="error"`，並保留中文 `translatedQuery`。這確認網站保護／逾時時不會把未篩選公開書目當成匹配結果，且前端可對該來源顯示單獨重試操作。

### 2026-08-14 CxC 公開搜尋頁初步稽核

以公開 URL `https://cxc.today/zh/search?keyword=義忍` 進行兩次瀏覽器載入檢查後，頁面仍僅顯示載入動畫，未提供可驗證的作品卡片、創作者、封面、類型標籤或作品連結。CxC Adapter 因此須遵循既有來源隔離契約：僅解析實際公開頁取得的資料，若渲染逾時或無可驗證作品卡片，回傳空結果與可單獨重試的來源狀態，絕不建立 placeholder 作品。

同日以 FastAPI 對 `keyword="義忍"`、`platforms=["cxc"]`、`forceRefresh=true` 執行實測，回傳 HTTP 200 的安全搜尋 envelope：`items=[]`、`totalWorks=0`、`platformStatuses[0].status="error"`，並保留 `translatedQuery="義忍 富岡義勇 胡蝶忍"` 與明確警示 `Public search did not finish rendering; skipping cleanly`。因此 CxC 在公開頁尚未提供可驗證作品時，可由前端顯示單獨重試，不會產生未驗證內容。

2026-08-14 再次以瀏覽器開啟同一 CxC 公開搜尋 URL，畫面及可讀內容仍僅為 `img/ani_loading_black.png` 與載入動畫，未出現作品卡、公開作品連結或結果總數。因此本輪會以使用者指定的作品選擇器作有界等待；若頁面未產生可驗證卡片，持續回傳 `error` 與空結果，不猜測官方筆數。

### 2026-08-14 閱讀清單升級 UI 預覽

在預覽站實際切換「我的閱讀清單」後，畫面顯示既有 1 張本機閱讀卡，以及「全文搜尋」輸入欄、收藏時間／評分排序選單、JSON 匯出與匯入按鈕、標籤篩選和星級篩選。既有卡片的標題、作者、筆記與自訂標籤均未遺失，新增控制列以原有 Blueprint／Monospace 樣式呈現。此結果與閱讀清單 UI 互動測試共同確認新控制不會破壞 LocalStorage 內容或閱讀卡版面。

同一預覽工作階段已開啟 CP 詞庫管理彈窗，確認畫面提供「中文縮寫」、「AO3 標準 Tag／Query」與「中文全名／本地 Query」三個欄位，並在每筆對照列中分開展示 AO3／LOCAL 查詢與 SYSTEM／CUSTOM 來源標示。後續熱更新會關閉暫開的彈窗，但首頁與既有本機閱讀卡仍可正常重新載入。

CxC Adapter 更新後，以 FastAPI 對 `keyword="義忍"`、`platforms=["cxc"]`、`forceRefresh=true` 實測。CxC 公開頁未產生可驗證作品卡時，API 正確回傳 HTTP 200 安全 envelope：`items=[]`、`totalWorks=0`、`platformStatuses[0].status="error"`，且仍保留 `translatedQuery="義忍 富岡義勇 胡蝶忍"` 與可單獨重試的 warning。這確認新版有界等待不會讓 CxC 失敗阻斷其他來源或生成未驗證結果。

另以自訂詞庫 `黑邪 → AO3: Heiyan/Wu Xie；LOCAL: 黑邪 黑眼鏡 吳邪` 進行同一 API 路徑實測；CxC 狀態回傳的 `translatedQuery` 為 `黑邪 黑眼鏡 吳邪`。即使 CxC 當下仍安全降級為空結果，自訂 AO3／本地雙查詢已確認可在每次請求中生效，不會寫入或污染其他使用者的快取。

匯入預覽確認流程以使用者層級互動測試載入含兩張閱讀卡的 JSON 備份，驗證彈窗會顯示「確認匯入閱讀清單」、收藏／標籤統計、預覽作品「備份預覽 A」與「備份預覽 B」，並提供「合併資料」、「完整覆蓋」及「取消」三個動作。取消流程不寫入 LocalStorage；合併與覆蓋的資料策略則由閱讀清單工具測試另行驗證。
