# 爬蟲穩定度與速度優化驗證

| 機制 | 驗證結果 |
| --- | --- |
| 資源攔截 | 所有 Playwright Adapter（AO3、CxC、同人誌中心、在水裡寫字、Penana fallback）透過共用 provider 阻擋 `image`、`stylesheet`、`font`、`media`、`websocket`；`document` 與 `xhr` 持續通行。 |
| 瀏覽器重用 | 聚合層使用長駐且有界的 Adapter worker pool；每個同步 Playwright worker 保留 thread-local Chromium，每次抓取仍建立並關閉新 context/page。 |
| 來源快取 | 平台／有效轉譯關鍵字／頁碼建立 10 分鐘快取。一般再查命中 `fromCache`；`forceRefresh` 會清除該來源 cache 後重抓。 |
| 單一來源 | `/search` 兼容 `platform` 與 `platforms`；指定 `platform: cxc` 僅排程 CxC Adapter。既有前端單獨重試使用 `forceRefresh` 與單元素平台陣列，仍只更新指定來源。 |
| Deadline | 既有每來源 8 秒 deadline、部分結果回傳、官方總數與錯誤隔離流程均未修改。 |

## 實測

在已啟動的 FastAPI 上，單一 CxC 搜尋「鬼滅」的兩次連續 cache 命中分別為 **11 ms** 與 **10 ms**，第二次回應明示 `fromCache: true`。

> 外部來源的首次冷啟動回應仍取決於上游網路、防護與渲染；系統以來源級 8 秒 deadline 防止任何來源阻塞整體搜尋，並讓快取命中回應維持低延遲。

## 回歸

- Python：**61 passed**。
- TypeScript：`pnpm exec tsc --noEmit` 通過。
- Vitest：**39 passed**。
