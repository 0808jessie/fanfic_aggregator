# AO3 與台灣平台公開頁稽核紀錄

## 2026-08-13 公開頁觀察

| 平台 | 指定公開 URL | 可觀察結果 | Adapter 處置 |
| --- | --- | --- | --- |
| AO3 | `https://archiveofourown.org/works/search?commit=Search&work_search[query]=鬼滅` | Sandbox 瀏覽器取得 Cloudflare 525 SSL handshake failed，沒有可用作品 heading。 | 保持官網原生 query URL，遇到 525 時安全隔離；總筆數以成功頁面的 heading 為唯一來源。 |
| 在水裡寫字 | `https://slashtw.space/search.php` | 公開 Discuz 搜尋表單可讀取，含快速搜尋輸入框 `scform_srchtxt`。 | 使用公開表單流程；驗證頁或 Discuz 冷卻訊息時立即返回空結果，不自動繞過驗證。 |
| 同人誌中心 | `https://www.doujin.com.tw/books/search?q=鬼滅` | Sandbox 無法萃取頁面正文，可能為動態載入或存取保護。 | 使用完整一般瀏覽器 Header 與既有安全 challenge 偵測；僅解析可驗證的 `/books/info/` 卡片。 |

本次不將 Cloudflare Challenge、525 或空頁回應視為搜尋結果，也不產生佔位作品。AO3 `totalWorks` 必須直接取自成功搜尋頁的可見 heading；若頁面無可驗證總數，回傳已取得結果的實際數量而不宣稱與官網一致。

## 2026-08-13 伺服器端實測

FastAPI 的 AO3 單一平台 `fanfiction` 查詢，實際使用下列第一頁 URL，未附加 `language_id` 或其他隱藏限制：

```text
https://archiveofourown.org/works/search?commit=Search&work_search%5Bquery%5D=fanfiction
```

初步回應曾因無法辨識新版 heading 而以已抓取卡片數作為保守 fallback；其後已由嚴格 heading 診斷取代，不再將 fallback 視為官網精準總數。混合 AO3、Penana、在水裡寫字與同人誌中心查詢時，AO3 與 Penana 回傳真實作品；在水裡寫字的 Challenge 只記錄於後端，沒有傳至 response `warning`。同人誌中心未產生未驗證作品卡。

後續成功 AO3 頁面診斷顯示新版 heading 文案為 `311,063 Found ?`（而不是舊版的 `1 - 20 of … Works`）。對同一個 `fanfiction` 查詢，Adapter 擷取 `311,063`，FastAPI `totalWorks` 亦為 `311,063`，診斷腳本輸出 PASS。Adapter 現已將這個 heading 格式列為官方總筆數來源；診斷僅在成功擷取這類 heading 時才會聲稱 `totalWorks` 可與公開頁對照。
