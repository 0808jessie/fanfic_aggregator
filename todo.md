# 專案待辦事項

## 後端（Python FastAPI）
- [x] 建立 FastAPI 專案基礎並整合至 Node.js 代理服務
- [x] 設計並實作 SQLite 資料庫模型與持久化邏輯
- [x] 開發 AO3 平台爬蟲適配器
- [x] 開發 Lofter 平台爬蟲適配器
- [x] 建立統一的 Scraper Adapter 介面與 Pydantic metadata 模型
- [x] 實作後端搜尋 API、聚合、去重與快取邏輯
- [x] 為搜尋服務加入錯誤處理與 FastAPI 健康檢查端點
- [x] 驗證 FastAPI 健康檢查、平台清單與單一平台搜尋流程

## 前端（React）
- [x] 建立 React 搜尋介面與統一搜尋欄
- [x] 實作搜尋結果卡片列表，顯示標題、作者、摘要、標籤、平台與原文連結
- [x] 實作 AO3 / Lofter 平台篩選功能
- [x] 應用數學藍圖視覺風格、幾何裝飾與響應式排版
- [x] 透過 Node.js tRPC 代理呼叫 Python FastAPI 搜尋服務

## 品質與交付
- [x] 建立 FastAPI tRPC 代理 Vitest 測試
- [x] 通過 TypeScript 檢查與 Vitest 測試
- [x] 撰寫 README 文件與設定檔；GitHub 遠端建立保留給使用者確認後執行
- [ ] 建立最終 checkpoint 並交付專案版本
