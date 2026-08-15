# AO3 525 與 Penana 403 來源防護驗證

## 公開端點量測

以「義忍」執行五來源診斷時，AO3 的公開 HTTP 搜尋在一次 600ms 有界重試後仍回傳 HTTP 525；Penana 公開 Finder 回傳 HTTP 403。兩者的回應皆發生於網站上游，FastAPI、Unix socket、tRPC 與前端服務均保持健康。

| 來源 | 上游結果 | 系統行為 |
| --- | --- | --- |
| AO3 | HTTP 525 | 600ms 後僅重試一次，之後標記 blocked；狀態卡提供 AO3 官方搜尋連結。 |
| Penana | HTTP 403 | 標記 blocked；狀態卡提供 Penana 官方搜尋連結。 |
| 同人誌中心、在水裡寫字、CxC | 可驗證公開結果 | 正常回傳，不受 AO3／Penana 狀態影響。 |

## 使用者可用降級

當來源被阻擋時，使用者可以在狀態卡中開啟原站搜尋：

| 來源 | 官方連結格式 |
| --- | --- |
| AO3 | `https://archiveofourown.org/works/search?commit=Search&work_search[query]=<keyword>` |
| Penana | `https://www.penana.com/search?t=story&search=<keyword>` |

兩個連結都以新分頁開啟且停止事件傳遞，因此不改變目前的來源篩選；來源卡的「重試」仍只會重新查詢自己。

## 回歸

- Python：**72 passed**。
- Vitest：**44 passed**。
- TypeScript：通過。
