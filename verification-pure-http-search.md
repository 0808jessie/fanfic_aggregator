# 純 HTTP 搜尋重構與來源診斷

## 架構結果

| 項目 | 實作結果 |
| --- | --- |
| 無頭瀏覽器 | 已自即時搜尋 Adapter、支援 runtime、相關測試與手動檢查腳本移除。程式碼掃描確認不存在 `playwright`、`sync_playwright`、`browser_runtime` 或 `page.goto`。 |
| HTTP 路徑 | AO3、在水裡寫字、同人誌中心、Penana 皆採純 requests + BeautifulSoup；CxC 優先採官方公開 `/book` API，僅於可用但不完整回應時讀取靜態 `/zh/search` HTML。 |
| 時間預算 | Adapter HTTP 採 3 秒連線／6 秒讀取；聚合 task 於 6.5 秒回傳來源級狀態。AO3 只讀取使用者要求的當前頁，不再自動追加第二頁。 |
| 隔離 | 每來源獨立 task／worker；任一來源逾時、403 或防護頁只回報自身，其他已成功來源正常傳回。 |
| 診斷 | 新增 `pnpm test:search -- <關鍵字>`；每列輸出來源、狀態、耗時、官方／可驗證筆數與 warning。 |

## `蛇戀` CLI 實測

```text
AO3             success  4793 ms  43
CxC 創利市集     success  5193 ms  5
同人誌中心        success  4792 ms  33
在水裡寫字        error    6509 ms  0   （來源 deadline）
Penana           blocked  4154 ms  0   （HTTP 403）
```

上列結果反映診斷當下的公開來源狀態；在水裡寫字與 Penana 的失敗均以來源級狀態呈現，不影響三個成功來源的結果。

## 回歸

- Python：**71 passed**。
- Vitest：**42 passed**。
- TypeScript：通過。
