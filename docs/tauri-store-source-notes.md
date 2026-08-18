# Tauri Store 整合依據

- 官方文件：https://v2.tauri.app/plugin/store/
- Store 是可跨 App 重啟持久保存的非同步 key-value store；前端可使用 `load("store.json")`、`get`、`set` 與 `save`。
- Tauri v2 capability 預設會封鎖 Store 操作，因此主視窗 capability 必須包含 `store:default`。
- 本專案將收藏存為 `favorites.json`，其餘個人偏好存為 `settings.json`；相對檔案名稱由 Store plugin 保存於桌面應用程式資料目錄。
