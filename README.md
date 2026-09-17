# Browser Image Converter

純前端圖檔轉換器。檔案不會上傳伺服器，轉換在瀏覽器本機完成。

## 第一版功能

- JPEG / JPG / PNG / WebP / BMP → JPG / PNG
- PDF → 每頁 JPG / PNG
- 批次加入與逐檔轉換
- JPG 品質調整
- PDF 輸出解析度調整
- 單檔下載
- PDF 每頁個別下載
- 全部輸出打包 ZIP
- GitHub Pages 自動部署 workflow

## 本機開發

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## GitHub Pages

1. 建立 GitHub repository，將本專案 push 到 `main`。
2. 到 Repository → Settings → Pages。
3. `Build and deployment` 的 Source 選 `GitHub Actions`。
4. push 後 `.github/workflows/deploy.yml` 會自動 build 並部署。

`vite.config.ts` 使用 `base: './'`，因此不需要把 repository 名稱寫死在設定裡。

## 設計原則

- 不需要 Backend / Database。
- 來源檔案只存在使用者瀏覽器記憶體中。
- 批次轉換採 sequential queue，降低大量圖片與 PDF 同時佔用 RAM 的風險。
- PDF 使用 PDF.js，ZIP 使用 fflate。

## 第一版限制

- 尚未支援 HEIC / HEIF / TIFF / RAW / PSD / SVG。
- GIF 動畫尚未定義逐幀轉換行為，因此未列入支援格式。
- 非常大型 PDF 仍受瀏覽器 RAM 上限影響。
