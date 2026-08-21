# Reader 修復驗證筆記

## 在水裡寫字 thread/92521

- 2026-08-21 本機 Reader API 對 `https://waterfall.slashtw.space/thread/92521` 回傳 HTTP 200，標題為「[鬼滅之刃│義忍] 鬼毒 [R18] - 在水裡寫字」，作者為 `m19910228`，現有回應為單一章節。
- 公開 SSR HTML 僅可見一個 `article` 與一個 `#ssr-content`，未含傳統 Discuz `post_*` 或 `postmessage_*` 節點；瀏覽器端先顯示成人內容提示，未經使用者明確確認不點擊繼續。
- 多樓層解析需同時保留既有 Discuz UID／作者連續樓層邏輯，並對 SSR 可公開提供的所有文章／樓層節點進行結構化收集；不讀取、保存或注入來源登入或年齡確認資料。
