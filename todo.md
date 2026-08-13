# Example Domain 修正待辦事項

- [x] 階段一：識別 Example Domain 產生的來源（來自 generate_fallback_data 的 example.com 佔位連結）
- [x] 階段二：移除 FastAPI 的虛構 fallback 資料生成，改為當即時爬蟲與快取皆無時回傳空陣列與具體錯誤提示，避免產生誤導性的 Example Domain 連結
- [x] 階段三：修正前端 Home.tsx，當無結果或外部來源暫時無法存取時，呈現清晰的狀態提示與引導，不顯示假卡片
- [x] 階段四：執行測試、驗證搜尋行為並儲存修正版 checkpoint
- [x] 後端加入平台主機 URL 信任邊界，拒絕 Example Domain、localhost 與跨平台來源
- [x] 修正 SQLite upsert 僅寫入 ORM 實際欄位，保留 source / warning 為執行期回應欄位
- [x] 補上 URL 過濾與空結果回退的回歸測試
- [x] 透過瀏覽器完成 live AO3 結果與 Discovery Halted 空結果的端到端驗證
- [x] 建立 verification-notes.md，保存本次自動化與預覽驗證紀錄

- [x] AO3 Adapter 支援 page 參數並於 page=1 自動抓取第 1、2 頁
- [x] 解析 AO3 totalWorks / totalPages，並在 SearchResponse 回傳分頁 metadata
- [x] 前端顯示真實總作品數，新增 Load More 追加結果與 loading 狀態
- [x] 為多頁抓取、page-aware cache 與前端追加流程補上回歸測試
- [x] 完成多頁端到端驗證並儲存新的 checkpoint
- [x] 新增自動化回歸測試覆蓋 AO3 page=1 兩頁合併、page=3 後續載入與 page-aware memory cache metadata
- [x] 新增 Home.tsx Load More append / loading 行為測試
- [x] 在瀏覽器實際操作搜尋與 Load More，確認 totalWorks 顯示與結果追加
- [x] 多頁功能驗證完成後儲存涵蓋本輪修改的新 checkpoint
- [x] 新增 Home.tsx/前端層級互動測試，覆蓋 totalWorks 顯示、Load More append/去重與 pending 文案
- [x] 完成 Home.tsx 互動測試後儲存涵蓋本輪多頁功能的新 checkpoint
- [x] 在 Home.tsx 元件互動測試中加入重複 URL 回傳，確認既有卡片不會重複渲染
- [x] 完成 Home.tsx 去重互動測試後建立新的多頁功能 checkpoint

- [x] 建立統一 StoryItem 平台聯集與多平台 Adapter registry
- [x] 以平行查詢隔離 AO3/Lofter 失敗並合併真實結果與平台 warning
- [x] 接上前端平台複選、平台 Badge 與搜尋請求 platforms 參數
- [x] 補上多平台平行搜尋、錯誤隔離與前端平台篩選回歸測試
- [x] 完成混合平台端到端驗證並儲存新的 checkpoint
- [x] 將 Lofter Adapter 重構為 /tag/{keyword} 模式，使用行動裝置 UA、10 秒等待與 auto-scroll 觸發動態加載
- [x] 加入 Lofter 404/Timeout 安全空結果 fallback 與錯誤日誌記錄，確保單一平台失敗不阻斷 AO3
- [x] 通過 Python 多平台 registry 測試、分頁測試、TypeScript、Vitest 與 production build 驗證

- [x] 建立可擴充的 AO3 CP Tag Mapping，支援義忍、五夏、夏五、勝出與轟出
- [x] 讓 AO3 依 CP mapping 使用 tag_names 搜尋，未知關鍵字維持 query 搜尋
- [x] 解析 AO3 relationship 與 character tags，並保留統一 StoryItem metadata
- [x] 前端以淡粉/淡紫樣式醒目顯示 CP relationship tags
- [x] 補上 Lofter blocked/offline 與 AO3 CP 搜尋回歸測試並完成端到端驗證
- [x] 在瀏覽器實際驗證搜尋「義忍」的 UI 流程，確認 mapping、無結果/rate-limit 狀態與舊快取隔離
- [x] 補一個可重現的 mock AO3 mapped-tag 整合測試，驗證 API 到前端 relationship/character tag 契約
- [x] 完成上述缺口後建立本輪 CP mapping checkpoint
- [x] 儲存包含 AO3 CP mapping、relationship/character tag、義忍 UI 驗證與 mock 整合測試的最新 checkpoint，並記錄版本 ID
- [x] 儲存包含 AO3 CP mapping、relationship/character tag、義忍 UI 驗證與 mock 整合測試的最新 checkpoint，並在交付紀錄中記錄新版本 ID：fbc2fdec

- [x] 將 AO3 CP mapping 參數由 tag_names 改為 relationship_names
- [x] 將 CP 字典抽至 fastapi_app/constants/cp_tags.py
- [x] 實作 AO3 CP 搜尋失敗或 0 筆時自動降級至 work_search[query] 的 fallback 機制
- [x] 補上 CP 降級與常數模組的單元測試與端到端驗證

- [x] 修正 AO3 Playwright `wait_domcontent_loaded=True` 為標準的 `wait_until="domcontentloaded"`，確保導航正確無誤
- [x] 補上針對 AO3 relationship_names URL 生成與 fallback 機制的整合單元測試

- [x] 新增 AO3 fallback 實際 mock 整合測試，驗證 0 筆時會觸發 `_fallback_query_search`
- [x] 更新 verification 文件，確保記載 `relationship_names` 與受控降級流程

- [x] 移除硬式 CP map 複寫，改用原生的 `work_search[query]` 傳遞中文/非 ASCII 關鍵字
- [x] 建立 `fastapi_app/scripts/fix_ao3_search.py` 診斷腳本測試中文 CP 標籤
- [x] 驗證中文關鍵字搜尋並儲存 checkpoint

- [x] 檢查並修正 `fastapi_app/main.py` 的匯入路徑，確保 FastAPI 服務正常啟動
- [x] 執行 FastAPI `/search` 中文關鍵字 API smokeTest，驗證 API 回傳合約

- [x] 補上 package-style 匯入回歸測試，確認根目錄與 fastapi_app 目錄皆可正確匯入
- [x] 擴充 `test_fastapi_chinese_search.py` 斷言中文搜尋回傳 items 非空及完整 title/author/url 欄位

- [x] 補上真正的 package-style 匯入回歸測試 (`from fastapi_app import main`)
- [x] 在 `test_fastapi_chinese_search.py` 中強制斷言中文搜尋回傳 `items` 長度大於 0

- [x] 在專案根目錄下執行測試，驗證從根目錄以 package 形式載入 `fastapi_app` 與 `fastapi_app.main` 完全正常

- [x] 在測試中明確斷言 `from fastapi_app import main` 與 `import fastapi_app` 成功載入

- [x] 執行專門針對「義忍」的診斷腳本，對比 AO3 原始回應、URL 構建與解析結果
- [x] 檢查前端或後端對 `義忍` 是否有特殊字元過濾、mapping 衝突或快取阻擋
- [x] 修復義忍搜尋並通過完整回歸測試與端到端驗證

- [x] 執行完整的 Python 與 Vitest 回歸測試，確保所有規格 100% 通過

- [x] 執行專案中所有 Python 測試腳本，確認無任何隱含回歸

- [x] 撰寫詳細對比診斷腳本，測試繁體「義忍」與簡體「义忍」在 AO3 實際抓取與解析的差異
- [x] 檢查前端、tRPC 代理、FastAPI 路由與 AO3 Adapter 對繁體中文字元的編碼與快取 key 處理
- [x] 修正繁體「義忍」無法正確返回結果的問題並完成回歸驗證

- [x] 執行前端 UI 搜尋「義忍」的整合煙霧測試，確保代理與前端渲染完全正常

- [x] 執行不 mock payload 的真實前端/代理整合煙霧測試，確保代理打到真實 FastAPI 服務

- [x] 撰寫嚴格不吞錯、透過 tRPC 代理打到真實 FastAPI 服務的整合測試，斷言「義忍」回傳非空 items

- [x] 補上透過 tRPC `fastapiTrpcRouter` 呼call的端到端代理單元測試，驗證非 mock 狀態下的路由轉發合約

- [x] 撰寫真實呼叫 tRPC proxy 的單元測試，驗證傳入 `keyword: "義忍"` 時正確呼叫 Axios 並透傳 FastAPI 響應

- [x] 檢查 SQLite 與記憶體快取中所有「義忍」紀錄，識別並清除過期或空結果資料
- [x] 讓「義忍」搜尋強制略過本機快取與資料庫回退，優先回傳即時 AO3 結果
- [x] 補上義忍快取污染回歸測試，重啟服務後驗證真實搜尋結果

- [x] 新增義忍專用的全域記憶體快取清除，移除所有含義忍或义忍的快取 key
- [x] 補上全域記憶體快取清除回歸測試並再次驗證 tRPC 即時 AO3 回應

- [x] 建立 AO3 結果相關度評分與穩定排序（CP/標題/摘要、更新時間與字數）
- [x] 擴充搜尋契約支援 forceRefresh，並依高／一般／低可信度設定快取 TTL
- [x] 新增前端即時計時器、搜尋完成耗時與強制重新抓取控制
- [x] 實作前端字數／完結狀態篩選與相關度／更新時間／字數排序
- [x] 補上後端與前端回歸測試，驗證義忍相關度排序、快取策略與篩選互動
- [x] 限制 CP +100 分僅適用於完整配對或別名命中，避免單一角色標籤誤判
- [x] 補上後端同分時依更新時間與字數排序、單一角色不計 CP 分的回歸測試
- [x] 補上前端最新更新／字數最多排序與篩選互動的回歸測試
- [x] 驗證 doujin.com.tw 搜尋頁是否可公開存取、是否具備可解析的作品 metadata，並記錄資料來源限制
- [x] 新增同人誌中心 Adapter，僅回傳可驗證的同人誌中心作品連結與標準化 metadata
- [x] 將同人誌中心整合至平台 registry、API 契約與前端平台篩選／Badge
- [x] 建立 localStorage 閱讀清單資料模型，支援收藏、評分、筆記與自訂標籤
- [x] 新增作品卡片收藏操作、編輯收藏對話框與「我的閱讀清單」檢視
- [x] 建立 localStorage CP 詞庫管理功能，支援預設對照載入、新增、編輯與刪除
- [x] 新增搜尋歷史快速重搜與預設進階篩選條件保存
- [x] 補上 Adapter、個人化工具與搜尋偏好的單元／元件測試
- [x] 完成實際搜尋、收藏與詞庫管理介面驗證，並儲存檢查點
- [x] 稽核首頁已掛載閱讀卡編輯、閱讀清單與 CP 詞庫對話框，並確認卡片收藏控制存在
- [x] 以互動測試與預覽驗證搜尋、收藏筆記標籤、閱讀清單與 CP 詞庫的完整流程
- [x] 驗證在水裡寫字與 Penana 的公開搜尋頁、可用資料欄位及防護限制
- [x] 建立在水裡寫字 Adapter，標準化文章標題、作者、時間、標籤與連結並安全隔離錯誤
- [x] 建立 Penana Adapter，標準化作品標題、作者、簡介、字數、完結狀態、標籤與連結並安全隔離錯誤
- [x] 將兩個平台整合至 registry、URL 信任邊界、API 平台列表與前端篩選／Badge
- [x] 補上 Adapter 解析、HTTP 防護隔離、registry 與混合平台搜尋回歸測試
- [x] 完成實際混合搜尋驗證、全套回歸測試與檢查點
- [x] 消除中文 AO3 路由測試對瞬時外部限流的依賴，保留可重現的 API 契約驗證與獨立真實搜尋記錄
- [x] 更新義忍首頁測試的預設平台請求斷言，涵蓋在水裡寫字與 Penana
- [x] 補強 Penana Adapter：從可驗證的公開詳細頁提取字數與完結狀態，並對無資料情境採用明確空值降級
- [x] 補上 Penana 詳細頁 metadata 解析回歸測試與 P0 版本檢查點
- [ ] 儲存 WaterWriter／Penana P0 擴充與 Penana 詳細頁安全降級的最終 checkpoint
