# 檔案文字抽取：選型與量測（spike 記錄）

- **日期：** 2026-11-24
- **分支：** `feature/kayk-ai-analysis`
- **狀態：** 本地量測記錄。無網路呼叫、無資料庫、無 provider key。數字都是這台沙盒實測，環境見 §6。

## 1. 結論

| 項目     | 選擇                                                               |
| -------- | ------------------------------------------------------------------ |
| PDF      | `unpdf@2.2.2`（內含 serverless 版 pdf.js 建置）                    |
| DOCX     | `mammoth@1.13.0`                                                   |
| 執行位置 | **未定**，取決於 Edge Function 的記憶體與逾時實測（見 §7 第 3 項） |

兩者相加的安裝足跡約 **11.3 MB**（含共用依賴），冷啟動 import 約 **159–197 ms**（含 tsx 轉譯，屬上界），單檔解析 160–210 ms。

## 2. 為什麼不是其他選項

| 套件                                   | 版本    | 發佈解壓大小 | 為什麼不用                                                                                                                                            |
| -------------------------------------- | ------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pdfjs-dist`                           | 6.5.438 | 37.6 MB      | 功能最完整，但 37.6 MB 要進映像檔或 bundle，且需要自行處理 worker 與 `standard_fonts`；我們只要文字，不需要渲染。                                     |
| `pdf-parse`                            | 2.4.5   | 21.3 MB      | 包住 `pdfjs-dist` 再拉 `@napi-rs/canvas` 原生模組；原生依賴在 Edge Function 不可用，在容器內也讓映像檔多一層平台綁定。                                |
| `jszip` + 自行解析 `word/document.xml` | 3.10.2  | 0.7 MB       | 足跡最小，但要自己處理 XML entity、`w:t` 與 `w:tab`/`w:br`、表格順序、頁首頁尾；等於重寫 mammoth 的一小部分，且錯誤方式會很隱晦。列為備選，不是首選。 |
| `unpdf`                                | 2.2.2   | 3.1 MB       | **採用**。serverless 建置、無原生依賴、API 只要 `getDocumentProxy` + `extractText`。                                                                  |
| `mammoth`                              | 1.13.0  | 1.7 MB       | **採用**。`extractRawText` 直接給純文字，表格與標題會保留可讀順序。                                                                                   |

`mammoth` 的依賴閉包比它本身大（`jszip`、`@xmldom/xmldom`、`underscore`、`pako`、`readable-stream`、`saxes`、`lop`、`argparse`、`xmlbuilder`、`base64-js`），實測額外 **5,644 KB**。這是選它的實際代價，不是 1.7 MB。

## 3. 實測足跡

```
node_modules/.pnpm/unpdf@2.2.2      3,636 KB
node_modules/.pnpm/mammoth@1.13.0   2,044 KB
共用依賴閉包                         5,644 KB
合計                               ~11.3 MB
```

（`du -sk`，磁碟占用；npm 公佈的 `unpackedSize` 為 3,143,099 與 1,671,388 bytes。）

## 4. 實測冷啟動

三次獨立行程，Node 22.23.4：

```
unpdf   import  3.7 / 4.0 / 4.4 ms
mammoth import 88.7 / 101.5 / 106.5 ms
兩者相加       159–197 ms（含 tsx 轉譯，為上界）
```

`mammoth` 的 import 明顯較慢，因為它會拉起 zip 與 XML 解析器。若之後對冷啟動敏感，可改成第一次分析時才動態 import，這是一個可量測的後續優化，不在本次範圍。

## 5. 實測解析

| 檔案                                      | 大小     | 結果    | 字元 | 耗時               |
| ----------------------------------------- | -------- | ------- | ---- | ------------------ |
| `server/fixtures/ai/notes.pdf`（2 頁）    | 2,812 B  | `ready` | 679  | 194 / 199 / 210 ms |
| `server/fixtures/ai/notes.docx`（含表格） | 37,023 B | `ready` | 421  | 162 / 181 / 209 ms |

第一次呼叫含 pdf.js 初始化，之後的呼叫在同一個行程內會略快；上表是三個獨立行程，所以代表冷啟動後第一次解析的成本。

**記憶體量測（這是選上限的依據，不是推測）：**

```
輸入：97 KB、120 頁、4,800 行文字的合成 PDF
結果：ready，字元數 200,000（撞到字元上限）
耗時：917 ms
RSS：90 MB → 142 MB（+52 MB），約 0.43 MB/頁
```

兩個結論：

1. **檔案大小不是記憶體的良好預測指標。** 97 KB 的 PDF 讓 RSS 長了 52 MB，是自身大小的 560 倍，因為內容流是壓縮的。
2. **因此需要頁數上限，不只位元組上限。** 模組同時強制 `EXTRACTION_MAX_BYTES = 20 MiB` 與 `EXTRACTION_MAX_PAGES = 300`；300 頁 × 0.43 MB ≈ 130 MB，仍在 Edge Function 的記憶體之內。超過頁數的檔案標為 `unsupported_format / pdf_too_many_pages`，**不截斷**——只分析半份報告卻不告訴使用者，比明確拒絕更糟，而檔案本身仍可下載。

字元上限 `EXTRACTION_MAX_CHARS = 200,000`（約 5 萬 token 英文），超過即截斷並回報 `truncated: true`，不靜默。

## 6. 這台沙盒的環境

- Node 22.23.4，Linux x86_64，Ubuntu 24.04
- 量測方式：`process.memoryUsage().rss` 前後差值、`performance.now()`、三次獨立行程
- 沒有量測：Deno / Edge Function 執行環境、20 MB 的真實 PDF、100 MB 的檔案、併發抽取

## 7. 三件尚未證明、必須說清楚的事

1. **沒有在 Edge Function 上跑過。** 上表全部是 Node。Deno 的 pdf.js 行為、記憶體上限與 CPU 時間限制都可能不同；在有人實測之前，「抽取放在 Edge Function」只是假設。
2. **沒有測 20 MB 的 PDF。** 上限是政策選擇加上 120 頁的實測外推，不是 20 MB 的實測。
3. **執行位置未定。** 若 Edge Function 的記憶體或 CPU 時間不足以處理 300 頁，抽取必須改到有更多資源的執行環境（例如既有的 Express 服務或背景 worker）。這會改變 P2 的部署形態，因此列為需要 Adam 看到的決定，而不是由實作者默認。

## 8. 可重現的指令

```bash
corepack pnpm exec tsx server/ai/extraction/prototype.ts      # 印出兩個 fixture 的抽取結果
corepack pnpm exec vitest run server/ai                        # 26 個測試
/tmp/fixenv/bin/python server/fixtures/ai/generate_fixtures.py # 重新產生 fixture（需 reportlab、python-docx）
```
