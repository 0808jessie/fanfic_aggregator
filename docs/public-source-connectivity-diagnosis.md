# 公開來源連線診斷紀錄

日期：2026-08-19

## 外部公開入口實測

| 平台 | 路徑 | 實測結果 | Adapter 策略 |
| --- | --- | --- | --- |
| 巴哈姆特創作大廳 | `https://home.gamer.com.tw/creationSearch.php?kw=義忍` | 轉至 `https://www.gamer.com.tw/missing.html`，為已不存在的路徑。 | 不採用。 |
| 巴哈姆特創作大廳 | `https://home.gamer.com.tw/search.php?o=tag&kw=義忍` | 公開頁成功載入，顯示多筆創作項目與 `creationDetail.php?sn=` 連結。 | 第一頁採此官方公開 tag 搜尋；後續頁沿用公開 rendered pagination URL。 |
| POPO 原創市集 | `https://www.popo.tw/find/books?key=義忍` | 返回官方「該頁面已不存在」錯誤頁。 | 不採用；僅使用已驗證的 `GET /index` 加上公開 token 表單 `POST /search`。 |
| POPO 原創市集 | `https://www.popo.tw/index` | 公開首頁可載入並列出 `/books/<id>` 官方作品連結。 | 維持手動啟用、每一步 10 秒、整體來源 20 秒隔離。 |
| KadoKado 角角者 | `https://www.kadokado.com.tw/search?keyword=義忍` | 使用者實際瀏覽器可載入公開作品卡；沙盒 HTTP 請求會返回驗證頁。 | 維持公開 SSR 索引、12 秒來源隔離；驗證頁只回報 blocked，不處理 Cookie 或規避。 |

## 沙盒端對端結果

`POST /search` 僅選擇 `bahamut`、`popo` 與 `kadokado`，關鍵字為「義忍」時，巴哈姆特在約 2 秒內回傳 4 筆可驗證小說結果。POPO 公開 index 約 6.7 秒後成功回覆，但 public book search 返回驗證頁；KadoKado 在約 1.8 秒返回驗證頁。兩者皆被標示為來源級 `blocked`，沒有中斷巴哈姆特結果。

## 安全邊界

所有診斷僅使用匿名公開頁。不登入、不提交私密資料、不記錄搜尋值、Token、Header 或 Cookie；遇到防護頁時不進行隱藏 Webview、Cookie 擷取、注入或任何存取限制規避。
