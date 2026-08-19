# KadoKado 角角者公開索引研究

研究時間：2026-08-19

## 初步公開結構

`https://www.kadokado.com.tw/` 首頁在未登入情況下可讀取推薦、最新連載與華文原創作品。可見資料包含作品標題、作者、摘要，以及公開類型／標籤（例如 BL、百合、奇幻、犯罪懸疑推理）。首頁也提供「搜尋作品關鍵字」欄位與分類入口。

## 目前限制

在目前公開頁以一般 Enter 提交搜尋欄後，頁面未產生可辨識的標準搜尋 URL。初版 Adapter 不應猜測或反向工程非公開 API；下一步只會檢視公開前端載入的路由與資料端點。若無穩定、匿名可讀的官方搜尋回應，將把 KadoKado 保持為不啟用的來源，而非以登入、背景 Webview 或任何存取限制規避來補足。

## 動態頁面觀察

公開首頁由 Next.js 應用程式渲染，瀏覽器擷取的完整 HTML 已保存為 `/home/ubuntu/upload/www.kadokado.com.tw__1787132646000.html`。網站公開頁可呈現含付費、分級及一般內容的書卡，因此 Adapter 必須保留原站的分級資料；前端既有 R18 過濾將繼續在本機處理。後續僅檢視頁面公開輸出的 `__NEXT_DATA__`、連結路由及靜態 JS 所公開引用的搜尋 URL，不會呼叫未公開或需登入的內部介面。

## 已驗證的公開搜尋

公開前端 `/_next/static/chunks/pages/search-*.js` 顯示搜尋頁路由為 `/search`，並以 `keyword` query string 載入結果。`https://www.kadokado.com.tw/search?keyword=義忍` 已在未登入瀏覽器中回傳作品卡片；公開結果包含標題、作者、摘要、可見標籤、完成狀態、封面、互動計數與官方作品連結。完整結果 HTML 已保存為 `/home/ubuntu/upload/www.kadokado.com.tw_search_keyword__E7_BE_A9_E5_BF_8D_1787132713515.html`。Adapter 會只讀取此公開 SSR／初始回應資料，並保守過濾非 `/book/<titleId>` 官方作品連結。
