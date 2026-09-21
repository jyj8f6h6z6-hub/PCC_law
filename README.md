# 工程會電子法規彙編 v6.8（離線 / PWA 版）

本版以 v6.7 為基礎，保留原有法規、函釋、搜尋及智慧換行功能，新增離線使用能力。

## 離線內容
首次透過 HTTPS（例如 GitHub Pages）或 localhost / VS Code Live Server 成功開啟後，瀏覽器會快取：
- 網站介面（index.html、app.js、style.css）
- 145 筆工程會主管法規資料
- 3,666 筆 PRMS 函釋資料
- PWA manifest 與離線頁面

之後即使沒有網路，主要的法規閱讀、函釋閱讀及本機全文搜尋仍可使用。

## 手機安裝
1. 先在有網路時完整開啟網站一次，等待資料載入完成。
2. iPhone Safari：分享 → 加入主畫面。
3. Android Chrome：瀏覽器選單 → 安裝應用程式 / 加到主畫面。
4. 安裝完成後可先開啟一次，再切飛航模式測試。

## 電腦使用
建議使用 VS Code Live Server 或其他 localhost 靜態伺服器。Service Worker 不支援直接雙擊 index.html 的 file:// 模式，因此若直接雙擊檔案，離線 PWA 快取不會啟用。

## 注意
- 工程會、PRMS 等外部網站連結在完全離線時無法開啟。
- 本網站內已保存的法規與函釋內容不受影響。
- 若日後更新版本，Service Worker 的快取版本也應同步更新，避免裝置繼續使用舊檔。
