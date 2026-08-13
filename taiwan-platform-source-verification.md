# 在水裡寫字與 Penana 公開來源驗證

驗證時間：2026-08-13（GMT+8）

## 在水裡寫字

公開入口 `https://slashtw.space/search.php` 可正常存取，頁面標題為「搜尋 - 在水裡寫字 Written in Waters」，且頁面明確使用 Discuz! X3.2。搜尋表單含 `scform_srchtxt` 關鍵字欄位、快速／進階切換與「文章」搜尋類型。因此 Adapter 應以一般公開搜尋請求為限，僅解析論壇文章的標題、作者、發表時間、可見標籤與站內文章 URL；若接到登入、驗證、逾時或變更的結果頁，必須安全回傳空陣列。

## Penana

公開入口 `https://www.penana.com/search` 可正常存取，Finder 頁有「Enter Keywords」搜尋欄並提供 Works、Stories、Comics、Featured Works、Contests、Short Pieces 等範圍，以及 Fanfiction、Status of the Story、Story Length 等篩選。未帶搜尋條件時頁面會顯示可公開瀏覽的故事卡（作品標題、作者、更新文字與讀取量）；搜尋結果 Adapter 只會接受站內 `/story/{id}/{slug}` 作品 URL，並在有可見資料時擷取標題、作者、簡介、字數、完結狀態、標籤與更新時間。任何防護或解析失敗都須獨立隔離。

實際由 Finder 送出 `fanfiction` 後，網址為 `https://www.penana.com/search?&t=story&genre=all&filter=&rating_multiple=0,1,2&search=fanfiction`，並顯示「Search results for」。結果內容採延遲載入；Adapter 應使用同一公開 GET 參數，但僅在 HTML 內存在可驗證 `/story/` 連結與同卡可見 metadata 時回傳作品，否則回傳空結果與診斷訊息。

等待公開頁面完成載入後，搜尋結果顯示多張 `Story` 卡；每張含作品標題、作者、讀取量與「Updated to #」更新文字。瀏覽器亦儲存了完整 HTML 供 DOM 結構分析。由於列表卡未必提供完整簡介、字數或完結狀態，Adapter 對缺失欄位應使用 `None`／空字串而非推測；之後可只針對確定的站內 story 詳細頁補足資料。

完整 DOM 的第一筆卡片使用 `.newXbox.p0.storydata`，卡片 `data-id` 為作品 ID；標題與詳細頁為 `.hiddenInfo a.newBookTitle[href^="/story/"]`，作者為 `.newAuthorname`，簡介為 `.hiddenInfo .storyInfo p`，標籤為 `.hiddenInfo .storyTag a[href^="/tag/"]`，更新文字為 `.newBookData .time`。作品列表中的 `newBkwords` 實際是讀取量，而非字數，不得當作 wordCount 回傳。

對在水裡寫字的唯讀 POST 表單實測（`search.php?mod=forum`、`formhash`、`srchtxt`、`searchsubmit=yes`）被 Cloudflare 回覆黑底攔截頁，其中包含 `/cdn-cgi/content` 與站方錯誤圖片。Adapter 必須偵測這些標記並回傳隔離警示，不得嘗試繞過驗證。

## 實際混合 API 驗證

以 `fanfiction` 對 FastAPI 發送 `platforms=["penana", "waterwriter"]` 並強制更新時，Penana 回傳可驗證的公開 story 結果；在水裡寫字則回傳「Search page is protected by a verification challenge」警示。回應仍標示 `source=live` 並僅包含 Penana 作品，確認單一平台防護不阻斷其他 Adapter。另以 AO3 強制查詢「義忍」取得真實作品卡；第二頁發生 HTTP 525 時，系統保留第一頁結果並附上 partial-results 警示。

## Penana 詳細頁 metadata

公開詳細頁 `https://www.penana.com/story/205687/zoids-infinity/` 顯示字數 `3.2K`。DOM 中字數使用 `span[title="Word Count"] .bkwords`，該 `span` 的子圖像為 `WordCount.svg`；這與列表頁的讀取量欄位不同。此示例詳細頁未顯示完整／連載狀態，因此 Adapter 僅能在詳細頁明確出現 `Completed`、`In Progress`、`On Break`、`Planning`、`完結` 或 `連載` 這類作品狀態時回傳布林值，否則需保留 `None`。

實際 API 回傳的第一筆作品 `https://www.penana.com/story/95912/the-great-gatsby-movie-fireworks/` 也公開顯示 Word Count `933`；其 DOM 與上述選擇器完全一致。這證實詳細頁的資料可被公開瀏覽，並需要針對 headless 內容載入差異進行受控診斷。

在 server-side headless Adapter 進行詳細頁請求時，Penana 回覆 Cloudflare 驗證內容，未提供 `Word Count` 節點。Adapter 會只保留已驗證的公開搜尋卡，將 `wordCount` 明確降級為 `null`，並在回應加入「Public detail metadata is verification-protected」警示；不會猜測或編造字數。若搜尋卡含明確 `Completed`／`完結` 文字，`isComplete` 仍會依該可見文字回傳；其他情況維持 `null`。
