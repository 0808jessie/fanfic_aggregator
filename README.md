# Fanfic Atlas

Fanfic Atlas 是一個以 **Python FastAPI + Node.js/tRPC 代理 + React** 建立的同人小說多平台聚合搜尋工具。使用者可以在單一搜尋介面輸入關鍵字，同時查詢 AO3、Lofter 等來源，並以統一的作品 metadata 格式呈現標題、作者、平台、標籤、摘要、抓取時間與原文連結。

## 架構總覽

```text
React UI
  │  tRPC mutation: fastapi.proxy
  ▼
Node.js / Express
  │  axios proxy, FASTAPI_BASE_URL
  ▼
Python FastAPI
  ├── Scraper Adapters
  │   ├── AO3Scraper
  │   └── LofterScraper
  ├── Search aggregation / deduplication
  └── SQLite + SQLAlchemy cache
```

前端不直接連線外部平台，而是經由 Node.js 代理呼叫 Python FastAPI。FastAPI 內部將不同平台的回應轉換為相同的 `ScrapedFanfic` 結構，因此新增平台時只需要新增一個 adapter 並註冊至 `SCRAPERS`。

## 目錄結構

| 路徑 | 職責 |
|---|---|
| `client/src/pages/Home.tsx` | 搜尋欄、平台篩選、結果卡片與原文連結 |
| `client/src/index.css` | 全域 token、藍圖網格、幾何裝飾與 responsive 樣式 |
| `server/fastapiTrpcRouter.ts` | Node.js 對 FastAPI 的型別化 tRPC 代理 |
| `server/routers.ts` | 應用程式 tRPC 路由註冊 |
| `fastapi_app/main.py` | FastAPI 健康檢查、平台清單與聚合搜尋 API |
| `fastapi_app/models.py` | 共用 Pydantic 輸入輸出模型 |
| `fastapi_app/database.py` | SQLite / SQLAlchemy engine、metadata 與舊資料欄位初始化 |
| `fastapi_app/scrapers/base_scraper.py` | 所有平台 adapter 必須實作的介面 |
| `fastapi_app/scrapers/ao3_scraper.py` | AO3 HTML 搜尋 adapter |
| `fastapi_app/scrapers/lofter_scraper.py` | Lofter best-effort HTML 搜尋 adapter |

## 本機啟動

### 1. 安裝 Node.js 依賴

```bash
pnpm install
```

### 2. 啟動 Python FastAPI

```bash
python3 -m venv venv
venv/bin/pip install fastapi uvicorn sqlalchemy requests beautifulsoup4
venv/bin/uvicorn fastapi_app.main:app --host 0.0.0.0 --port 8000
```

FastAPI 的設定集中在 `fastapi_app/config.py`。SQLite 檔案預設位於專案根目錄的 `fanfic.db`；可透過 `FANFIC_DB_PATH` 指定其他位置，也可用 `CACHE_TTL_SECONDS` 調整快取時間。第一次啟動會建立 `fanfics` 表；若本機資料庫來自舊版模型，初始化程式會補上 `keyword` 欄位。常用設定如下：

| 設定 | 預設值 | 用途 |
|---|---|---|
| `FASTAPI_BASE_URL` | `http://localhost:8000` | Node.js tRPC 代理的上游 URL |
| `FASTAPI_HOST` | `0.0.0.0` | FastAPI 綁定介面 |
| `FASTAPI_PORT` | `8000` | FastAPI 服務埠號 |
| `CACHE_TTL_SECONDS` | `3600` | SQLite 搜尋快取有效秒數 |
| `FANFIC_DB_PATH` | `<project>/fanfic.db` | SQLite 檔案位置 |

這些值可在啟動指令前以環境變數覆寫，例如 `CACHE_TTL_SECONDS=1800 FANFIC_DB_PATH=/tmp/fanfic.db venv/bin/uvicorn fastapi_app.main:app --host 0.0.0.0 --port 8000`。

### 3. 啟動 React + Node.js 服務

另開終端機執行：

```bash
pnpm dev
```

Node.js 預設會透過 `FASTAPI_BASE_URL=http://localhost:8000` 將 tRPC 代理請求轉送至 FastAPI。若 FastAPI 位於其他位置，可在啟動前設定：

```bash
FASTAPI_BASE_URL=http://127.0.0.1:8000 pnpm dev
```

## API

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/fastapi-status` | FastAPI 健康檢查 |
| `GET` | `/platforms` | 回傳已註冊的平台與狀態 |
| `POST` | `/search` | 接收 `{ keyword, platforms }`，回傳去重並依抓取時間排序的 metadata 陣列 |

`platforms` 可省略，省略時會查詢所有已註冊 adapter。搜尋結果會先嘗試使用一小時內的 SQLite 快取；若選取的平台沒有完整快取，才會向外部平台發出新請求。

## 新增平台 Adapter

新增平台時，建立 `fastapi_app/scrapers/example_scraper.py`，繼承 `BaseScraper` 並回傳 `list[ScrapedFanfic]`。接著在 `fastapi_app/main.py` 的 `SCRAPERS` 中註冊平台 ID：

```python
from .scrapers.example_scraper import ExampleScraper

SCRAPERS = {
    "ao3": AO3Scraper,
    "lofter": LofterScraper,
    "example": ExampleScraper,
}
```

Adapter 必須設定合理的 User-Agent、timeout 與 HTTP 錯誤處理，也不應在無法取得外部內容時產生虛構作品資料。不同平台的服務條款、robots 規範、登入限制與流量限制，應在正式部署前另外確認。

## 品質檢查

```bash
pnpm check
pnpm test
```

目前測試涵蓋 Node.js tRPC 代理的成功轉送與上游 HTTP 錯誤處理。外部平台爬蟲則採用 best-effort 設計，實際連線結果會受到平台頁面結構、反爬策略與網路環境影響。

## 設計語言

前端採用 off-white 紙張背景、黑色結構線、細微方格網、淡青色與柔粉色註記，以及粗重 display 標題和等寬技術標籤，形成數學藍圖與閱讀索引混合的視覺語言。介面在手機寬度下會將搜尋工具列與結果卡片堆疊，並保留鍵盤可操作的表單與連結焦點狀態。
