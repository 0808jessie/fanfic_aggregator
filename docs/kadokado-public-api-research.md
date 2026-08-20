# KadoKado 公開搜尋端點研究

## 已驗證事實

於 2026-08-20，以使用者已登入狀態無關的公開瀏覽器工作階段開啟 `https://www.kadokado.com.tw/search?keyword=義忍`，官方頁面可呈現作品卡片、作者、摘要、分類標籤、完結狀態與官方作品連結。這證明網站的**公開網頁搜尋功能**可用，但不代表伺服器端 HTTP 請求可繞過其防護。

## API 判定原則

搜尋結果曾出現未經官方文件佐證的 `api.kadokado.com.tw/v1/main/search/page-v2` 線索。此線索僅作研究起點；在確認其為公開、未要求登入、未要求 Cookie、可穩定回傳且可由網站公開資源佐證前，不會接入 Adapter。

## 2026-08-20 已驗證公開 JSON 端點

KadoKado 公開搜尋頁載入的前端資源將 API base URL 設為 `https://api.kadokado.com.tw`，並公開引用 `/v3/search` 路徑。以不帶 Cookie、登入、Referer 或瀏覽器指紋模擬的標準 JSON GET 請求呼叫：

```text
https://api.kadokado.com.tw/v3/search?current=1&limit=20&sentence=義忍
```

可取得 HTTP 200 JSON；`current` 與 `limit` 為必填分頁參數，`sentence` 會實際影響搜尋結果。回應包含 `total`、`data`，以及每筆作品的 `id`、`displayName`、`authorsDisplayNames`、`ownerDisplayName`、`logline`、`oneLineIntro`、`coverUrls`、`tags`、`genreDisplayNames`、`isRRated`、`isSerialized` 與 `wordCount`。Adapter 僅映射這些公開中繼資料及官方 `/book/<id>` 導流連結。

## 合規邊界

研究與後續實作不會轉移使用者瀏覽器 Cookie、進行 Cookie 預熱、模擬瀏覽器指紋、注入驗證資料或規避 Cloudflare／Turnstile。若沒有可驗證的公開資料端點，KadoKado 將保留 `blocked` 狀態與來源級 clean skip，並提供官方搜尋連結。
