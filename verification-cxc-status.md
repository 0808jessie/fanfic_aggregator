# CxC 公開搜尋驗證紀錄

## 2026-08-14：義忍

匿名瀏覽器開啟 `https://cxc.today/zh/search?keyword=%E7%BE%A9%E5%BF%8D` 時，頁面標題與可互動元素皆為空白，畫面未出現可驗證的作品卡或公開結果總數。另以 CxC 公開作品路徑驗證時，來源回傳「An error happened, please try again later」內容；Adapter 現會辨識這是 CxC 的公開錯誤頁，回報可單獨重試的 `error`／「連線逾時或等待渲染逾時」狀態。未建立任何 placeholder 作品。

前端以「義忍」啟動預設六平台搜尋後，前 21 秒仍在等待其他上游來源完成；因此本次 UI 觀察不將掃描中的畫面視為 CxC 卡片缺失。首頁單元測試已直接驗證：即使回應僅包含 AO3 狀態，CxC 卡仍會被補齊為可重試的「連線逾時」狀態。

同一輪前端實測完成後，頁面呈現 56 筆已驗證作品，ADAPTER CONNECTIONS 同時顯示 AO3、Lofter、同人誌中心、在水裡寫字、Penana 與 CxC 創利市集六張狀態卡。CxC 卡顯示「連線逾時」、`[CxC] 連線逾時或等待渲染逾時` 與「重試」按鈕；AO3 與 Penana 成功結果仍正常顯示，證實 CxC 失敗不會隱藏卡片或阻斷其他來源。

瀏覽器於 2026-08-14 重新載入 `https://cxc.today/zh/search?keyword=%E5%B0%8F%E8%AA%AA` 時，僅觀察到公開殼層、CSS、`vendor.be317610.js`、`app.1087a6aa.js`、搜尋路由分塊與 loading 圖；未出現 `/api/` 搜尋回應或作品卡 DOM。此結果支持現行 Adapter 對「未產生可信作品卡」採用可重試 error 降級，而非捏造作品。

其後在 CxC 原生介面輸入「小說」並觸發搜尋，頁面實際改導至 `/zh/explore?page=1&per_page=24&is_new&sort_by=updated_at&keyword=%E5%B0%8F%E8%AA%AA...`。此公開頁完整呈現「小說 (4145)」分類總數與多筆作品卡，並附標題、作者、摘要、更新日期及公開連結。因此 CxC Adapter 應改用此原生 explore 路由，而非停留在只呈載入殼層的 `/zh/search` 路由。

使用者瀏覽器於相同原生 explore URL 顯示真實公開結果，首筆為碳烤巧克力的《檔案存取中》，並呈現標題、作者、摘要與更新資訊；頁面 HTML 顯示作品連結格式為 `https://cxc.today/@<creator>/work/<numeric-id>`，例如 `https://cxc.today/@grilledchocolate/work/57417`。CxC 分類列顯示「小說 (4145)」，且第一頁呈現 24 筆作品、分頁最多 189 頁。這證實資料確實由 CxC 原生 explore 流程提供；沙箱 Playwright 仍未取得相同渲染結果，需以能取得該公開資料的請求方式完成後端 live 驗證。

最終 FastAPI live 驗證改用 CxC 官方公開 `https://api.cxc.today/book` 列表端點，帶入其公開前端對匿名 server 請求使用的固定裝置標頭與原始關鍵字。2026-08-14 對 `義忍` 的單一 CxC 搜尋成功回傳 `source=live`、`success=true`、`totalWorks=15` 與 15 筆可信作品；每筆均有 `https://cxc.today/@<creator>/work/<numeric-id>` 連結。回應包含例如夏織的《【鬼滅｜義忍】暮雪遲櫻》、艾利的《【この小さな手】》等公開作品，且標籤含「同人、鬼滅、義忍」或「鬼滅之刃、義忍」。
