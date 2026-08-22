# 指定 Reader 來源驗證紀錄

## 在水裡寫字 thread/21886

- 公開 URL：`https://waterfall.slashtw.space/thread/21886`
- 瀏覽器頁標題顯示：`[火影忍者│鹿鞠] 醫者（6/27更新第28章） [G] - 在水裡寫字`。
- 瀏覽器 SSR 畫面僅顯示登入區與最少內容，不採用登入、Cookie 或驗證繞過。
- Reader 現有公開 JSON 路徑為 `https://waterfall.slashtw.space/w/thread/<threadId>`；現行程式已依 `thread.authorid`／`post.authorid` 篩選樓主樓層，但只取 payload 的單一 `posts` 陣列，尚未處理 API 分頁或續頁資料。

## AO3 多章作品

- 公開 URL：`https://archiveofourown.org/works/84479586`
- Reader 現行策略：非指定章節時，以 `view_full_work=true` 加上成人公開視圖抓取作品全篇，解析 `#chapters > .chapter`。
- 所有請求維持公開內容、成人偏好 Cookie／參數與來源級安全降級；不繞過驗證、登入或頻率限制。
