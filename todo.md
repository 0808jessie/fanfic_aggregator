# Example Domain 修正待辦事項

- [x] 階段一：識別 Example Domain 產生的來源（來自 generate_fallback_data 的 example.com 佔位連結）
- [x] 階段二：移除 FastAPI 的虛構 fallback 資料生成，改為當即時爬蟲與快取皆無時回傳空陣列與具體錯誤提示，避免產生誤導性的 Example Domain 連結
- [x] 階段三：修正前端 Home.tsx，當無結果或外部來源暫時無法存取時，呈現清晰的狀態提示與引導，不顯示假卡片
- [x] 階段四：執行測試、驗證搜尋行為並儲存修正版 checkpoint
- [x] 後端加入平台主機 URL 信任邊界，拒絕 Example Domain、localhost 與跨平台來源
- [x] 修正 SQLite upsert 僅寫入 ORM 實際欄位，保留 source / warning 為執行期回應欄位
- [x] 補上 URL 過濾與空結果回退的回歸測試
- [x] 透過瀏覽器完成 live AO3 結果與 Discovery Halted 空結果的端到端驗證
- [x] 建立 verification-notes.md，保存本次自動化與預覽驗證紀錄

- [x] AO3 Adapter 支援 page 參數並於 page=1 自動抓取第 1、2 頁
- [x] 解析 AO3 totalWorks / totalPages，並在 SearchResponse 回傳分頁 metadata
- [x] 前端顯示真實總作品數，新增 Load More 追加結果與 loading 狀態
- [x] 為多頁抓取、page-aware cache 與前端追加流程補上回歸測試
- [x] 完成多頁端到端驗證並儲存新的 checkpoint
- [x] 新增自動化回歸測試覆蓋 AO3 page=1 兩頁合併、page=3 後續載入與 page-aware memory cache metadata
- [x] 新增 Home.tsx Load More append / loading 行為測試
- [x] 在瀏覽器實際操作搜尋與 Load More，確認 totalWorks 顯示與結果追加
- [x] 多頁功能驗證完成後儲存涵蓋本輪修改的新 checkpoint
- [x] 新增 Home.tsx/前端層級互動測試，覆蓋 totalWorks 顯示、Load More append/去重與 pending 文案
- [x] 完成 Home.tsx 互動測試後儲存涵蓋本輪多頁功能的新 checkpoint
- [x] 在 Home.tsx 元件互動測試中加入重複 URL 回傳，確認既有卡片不會重複渲染
- [x] 完成 Home.tsx 去重互動測試後建立新的多頁功能 checkpoint

- [x] 建立統一 StoryItem 平台聯集與多平台 Adapter registry
- [x] 以平行查詢隔離 AO3/Lofter 失敗並合併真實結果與平台 warning
- [x] 接上前端平台複選、平台 Badge 與搜尋請求 platforms 參數
- [x] 補上多平台平行搜尋、錯誤隔離與前端平台篩選回歸測試
- [x] 完成混合平台端到端驗證並儲存新的 checkpoint
