# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

以繁體中文為主、需要跨平台搜尋與整理同人小說的讀者；主要情境是桌面端的長時間探索、篩選、避雷與私人書單管理。

## Product Purpose

Fanfic Atlas 將多個同人創作來源的作品索引聚合為單一搜尋工作區，讓使用者能以關鍵字、CP、語言、分級與個人避雷設定找到作品，並建立可保留閱讀進度的私人藏書閣。

## Positioning

產品以跨來源可驗證連結、前端即時篩選與跨更新保留的本地個人資料為核心；它是索引與私人閱讀管理工具，而非作品內容託管平台。

## Operating Context

使用者會在私人的桌面閱讀環境中反覆搜尋、比較來自多個來源的作品、處理受阻來源、收藏作品、設定避雷分組並更新閱讀進度。

## Capabilities and Constraints

既有 FastAPI 爬蟲、搜尋 API、Tauri AppData 儲存、年齡保護、R18 分級、避雷分組、搜尋篩選、CP 釘選、歷史紀錄與書單匯入匯出均必須保持既有資料與行為契約。本次只允許重構前端視覺、排版、元件表現與微互動。

## Brand Commitments

名稱為 Fanfic Atlas。使用者明確指定「現代工藝閱讀器」：Raycast／Linear 般的精緻操作感，結合 Readwise／iA Writer 的閱讀節奏；風格必須克制、優雅、有呼吸感、低雜訊，且以繁體中文可讀性為優先。

## Evidence on Hand

現有 React／TypeScript／Tailwind 前端位於 `client/src/`；核心搜尋頁為 `client/src/pages/Home.tsx`，藏書元件位於 `client/src/components/BookshelfView.tsx` 與 `PersonalLibrary.tsx`。現有真實產品功能與測試皆以此程式碼為準；不得杜撰使用者評價、商業數據或內容來源。

## Product Principles

- 作品與閱讀任務優先於介面裝飾。
- 任何個人化保護設定都必須可辨識、可預期且不被視覺重構改寫。
- 多來源的不確定性應以平靜、可行動的狀態回饋呈現。
- 收藏與閱讀進度應像私人書房，而非管理後台。

## Accessibility & Inclusion

介面須維持繁體中文辨識度、鍵盤可達性、清楚焦點狀態、可讀對比與行動尺寸下的可操作性；限制級內容與避雷遮罩須保留既有保護行為。
