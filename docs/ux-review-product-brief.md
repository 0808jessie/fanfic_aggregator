# Fanfic Atlas UX Review Product Brief

## 1. Contract

| Field | Answer |
|---|---|
| schema_version | 2.1 |
| working_language | zh-TW |
| canonical_identifiers | en |
| fallback_language | en |

## 2. Product Direction

針對 Fanfic Atlas 桌面跨平台同人小說搜尋與藏書管理體驗進行啟發式審查，提出可分期實作的搜尋、非同步回饋、結果卡片與藏書管理優化方案；本次不實作任何功能。

## 3. Accountable Owner

專案擁有者（0808jessie）保留產品取捨、內容尺度、資料保留與任何後續實作的最終決策權。

## 4. Stage

Prototype / 內測迭代。

## 5. Actor Boundary

| Field | Answer |
|---|---|
| actor_boundary.target_population | 需要跨平台搜尋、收藏與避雷管理的成年同人創作讀者。 |
| Operator | 使用桌面 App 或網頁預覽執行搜尋、管理書單與設定偏好的讀者。 |
| Beneficiary | 希望迅速找文、降低避雷風險、保存閱讀脈絡的讀者。 |
| Machine or agent actor | 來源 adapter、FastAPI 搜尋服務、Tauri Store 本地持久化層。 |
| Affected people | 讀者、原始內容平台、被系統導流的創作者與社群。 |
| Excluded groups | 未滿 18 歲者、無法使用所支援平台或語言的讀者、缺少桌面裝置的使用者。 |

## 6. Business Boundary

| Field | Answer |
|---|---|
| Product organization | Fanfic Atlas 專案。 |
| Project owner | 0808jessie。 |
| Issuer | Fanfic Atlas 專案。 |
| Customers / Buyers | 目前未提供商業化或付費資訊；視為不適用。 |
| Operators | 專案擁有者與維護者。 |
| Partners | AO3、Penana、在水裡寫字、同人誌中心、CxC、Pixiv 等原始內容平台。 |
| Platforms | Tauri、GitHub Releases、Manus hosting 與來源網站。 |
| Regulators / externality bearers | 各平台使用規範、內容分級規範與受爬取頻率影響的平台社群。 |
| Decision authority | 專案擁有者。 |
| Value exchange | 以更低的搜尋、記錄與避雷成本，換取使用者持續採用；本次不主張或驗證營收模式。 |

## 7. Human Judgment Boundary

| Field | Answer |
|---|---|
| Human-owned decisions | P0／P1 排序、視覺語氣、R18 呈現尺度、備份策略與後續開發投資。 |
| Machine-supported inputs | 原始碼結構、已實作狀態、既有測試與視覺預覽。 |
| Not mechanized | 是否改動年齡保護、是否改動來源平台連線策略、是否發布。 |
| Named human approval gate | 0808jessie。 |
| Condition | 任何後續程式實作或發布前。 |

## 8. Unresolved Assumptions

- 目前沒有真實使用者訪談、任務完成率、搜尋漏斗或錯誤率資料。
- 讀者對「顯示被過濾作品」與「批次模式」的實際使用頻率未知。

## 9. Execution Boundary

| Field | Answer |
|---|---|
| May do | 檢視現有程式介面、識別風險、提出低風險資訊架構與互動建議。 |
| Must not do | 不在本審查中改動程式、不宣稱研究已驗證、不做發布或資料操作。 |
| Must ask | 實作 P0 前的目標裝置、目標使用者、內容保護尺度與成功指標。 |

## 10. Problem Hypothesis

成年同人讀者在跨六個來源搜尋與管理書單時，面臨多篩選條件、非同步等待與卡片資訊密度帶來的認知成本，現以反覆點擊、記憶篩選狀態與手動比對結果處理；若任務測試顯示首查、單一來源失敗復原與批次管理的完成時間下降且錯誤率下降，則此問題成立。

## 11. Current Evidence

| Signal | Source | Evidence tier | Collected at | Decision it supports |
|---|---|---|---|---|
| 搜尋表面含語言、字數、完結、排序、內容分級、平台與避雷等條件 | 現有 `Home.tsx` 介面與程式結構 | E1：產品內部檢視 | 2026-08-18 | 篩選分層與狀態可見性需優先檢視。 |
| 藏書閣已有排序、批次、進度、備份與匯入控制 | 現有 `BookshelfView.tsx` 與 `PersonalLibrary.tsx` | E1：產品內部檢視 | 2026-08-18 | 工具列密度與模式切換需檢視。 |
| 已有單一來源重試與遮罩解鎖設計 | 現有 `Home.tsx` | E1：產品內部檢視 | 2026-08-18 | 需評估狀態／復原的可預測性。 |

## 12. Proposed Next Step

完成標準 Gate 啟發式評估，提出 P0／P1 建議與最小任務導向可用性測試計畫；不直接進入實作。
