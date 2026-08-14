# Fanfic Atlas UI Redesign Context Pack

| Contract | Value |
| --- | --- |
| Review | `fanfic-atlas-ui-redesign-20260814` |
| Verdict | `continue` |
| Stage | Prototype |
| Accountable owner | Fanfic Atlas 專案擁有者 |

## Goal

把首頁改為「搜尋意圖 → 來源健康 → 作品判讀 → 保存脈絡」的連續工作區，降低首屏裝飾干擾，同時保留 Fanfic Atlas 的技術檔案感。

## Approved scope

讀者是主要操作者與受益者；搜尋 Adapter、CP 轉譯器與 LocalStorage 是輔助機器角色。可調整前端布局、色彩、字體、資訊層級、狀態與空畫面；不可改變 API、Adapter、資料庫、localStorage key 或來源真實性。

## Design system

| Token | Role |
| --- | --- |
| Night ink `#111826` | 主要字色與決策動作。 |
| Archive paper `#F5F1E8` | 閱讀區背景，避免冷白。 |
| Relay blue `#2D70D6` | 搜尋焦點、活動來源與互動狀態。 |
| Signal coral `#E76F51` | 錯誤、重試與需注意的來源。 |
| Index mint `#6FC7B6` | 已連線與保存成功。 |
| Graphite `#6E7480` | 次要資料與分隔。 |

**Typography.** 使用 `DM Mono` 呈現可掃讀的資料與來源狀態，並用 `Noto Sans TC` 處理中文閱讀；標題保留緊湊的高對比無襯線字重。

**Layout.** 將首頁改為上方固定的搜尋工作列，中段為可展開的來源健康列，底部以兩欄結果／保存脈絡配置呈現。手機則把保存脈絡收為次級節點，優先保留搜尋與結果。

**Signature.** 以「查詢軌跡」細線連接目前關鍵字、來源狀態與結果計數；它只在已有搜尋時出現，讓視覺裝飾反映真實系統狀態。

## Acceptance criteria

- 搜尋輸入、執行、來源狀態與結果摘要在首屏具有明確順序。
- 平台篩選、單一來源重試、收藏、閱讀清單、備份與 CP 詞庫管理仍可操作。
- 狀態、空結果與錯誤提示指出下一步而非只顯示系統訊息。
- 維持桌面與手機可讀性、可見焦點與 reduced-motion 行為。
- 全部既有測試與 TypeScript 檢查通過。

## Stop conditions and rollback

若任何核心互動、來源警示或 LocalStorage 管理流程回歸，停止擴大改版並回到本輪 checkpoint 前的版本。品牌改名、資料收集、外部發佈與 API／schema 改動需取得專案擁有者同意。
