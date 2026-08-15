# 非同步來源隔離與未知關鍵字驗證

## 架構調整

| 層級 | 調整後行為 |
| --- | --- |
| 聚合層 | 使用 `asyncio` 以每來源 task 協調搜尋；同步 Adapter 透過每次請求專屬 worker 執行，並由各 task 的 timeout 收斂。 |
| 連線隔離 | 每個 Adapter 都使用獨立的單次公開 HTTP 請求，沒有跨平台共用 requests Session 或連線池；慢來源不會佔住下一次搜尋的 worker。 |
| 時間預算 | 外部 HTTP 為 5 秒連線／10 秒讀取；來源 task 保持 18 秒上限，回傳來源級狀態而非全域失敗。 |
| 關鍵字 | AO3／CxC 與本地來源對未知 CP 保留使用者原詞；本地來源維持首個主詞，避免多詞 AND 檢索。 |
| 重試 | 前端既有單一平台 `platforms: [platform]` 與 `forceRefresh` 契約不變。 |

## 詞庫外關鍵字實測

以 **「蛇戀」** 對 AO3、同人誌中心、在水裡寫字、Penana、CxC 強制刷新：**5,547 ms** 完成。

| 來源 | translatedQuery | 狀態 | 結果 |
| --- | --- | --- | --- |
| AO3 | 蛇戀 | blocked | 來源防護狀態，未影響其他結果。 |
| 同人誌中心 | 蛇戀 | success | 官方總數 33。 |
| 在水裡寫字 | 蛇戀 | success | 官方總數 73。 |
| Penana | 蛇戀 | blocked | 來源防護狀態，可單獨重試。 |
| CxC 創利市集 | 蛇戀 | success | 官方總數 5。 |

## 回歸

- Python：**71 passed**。
- Vitest：**42 passed**。
- TypeScript：通過。
