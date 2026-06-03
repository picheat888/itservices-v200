# Stock Item History — Official PDF (dompdf)

**Date:** 2026-06-03
**Module:** Stock Management → Stock item → History
**Status:** Approved design — pending implementation plan
**Builds on:** `2026-06-03-stock-item-history-design.md` (the history page + endpoint)

## Problem

The SKU history page prints via the browser (`window.print()` + print CSS). The user wants
**official documents**: a server-rendered PDF with the company logo + name, real page numbers, and
a printed-on / printed-by footer — the kind of report you can file or hand to an auditor.

## Decisions (from brainstorming)

| Question | Decision |
|----------|----------|
| Which documents | All five views: **Summary** + **Issue** + **Receive** + **Counting & Adjust** + **Transfer**. |
| Header | Company **logo + name** (from Settings: `logo_path`, `company_name`). |
| Footer | **Page x/y**, **printed date-time**, **printed-by** (the requesting user). No signature block. |
| Output | Open the PDF **inline in a new tab** (view / save / print from the PDF viewer). Replaces `window.print()`. |
| Thai font | Embed **Sarabun** (Regular + Bold) — fetched from Google Fonts (github.com/google/fonts/ofl/sarabun); confirmed downloadable. |

## Architecture

### 1. Dependency + Thai font

- Add `barryvdh/laravel-dompdf` via Composer (`composer require barryvdh/laravel-dompdf`).
- Place `Sarabun-Regular.ttf` and `Sarabun-Bold.ttf` in `storage/fonts/`
  (download: `https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf` and `…/Sarabun-Bold.ttf`).
- Publish + edit `config/dompdf.php`: set `'font_dir'` / `'font_cache'` to `storage_path('fonts')`,
  `'enable_php' => true` (for the page-number script), `'isRemoteEnabled' => true` is **not** needed
  (logo embedded as base64). The blade declares `@font-face { font-family: 'Sarabun'; src: url('…Sarabun-Regular.ttf') }`
  (+ bold) and sets `body { font-family: 'Sarabun' }`, so Thai renders correctly.

### 2. Backend — shared data builder + PDF endpoint

- **DRY the aggregation:** extract the history-building logic currently inline in
  `StockItemController@history` into a reusable method (e.g. `private function buildHistory(StockItem $item): array`,
  or a small `App\Services\StockHistoryService`). Both the JSON endpoint and the PDF use it.
- **Route:** `GET /api/stock-items/{stockItem}/history/pdf` with query `?v=summary|issue|receive|adjust|transfer`
  (default `summary`), gated by `stock.view`.
- **Controller** `StockItemController@historyPdf`:
  - Build the history data; pick the rows for the requested view.
  - Resolve the logo: read `AppSetting::get('logo_path')`; if present, load the file from the public disk
    and pass a **base64 data URI** to the view (avoids dompdf chroot/remote issues). Company name from
    `AppSetting::get('company_name', 'Thai Inaba Foods Co., Ltd.')`.
  - `Pdf::loadView('pdf.stock-history', [...])->setPaper('a4', 'portrait')->stream("history-{$sku}-{$v}.pdf", ['Attachment' => false])`
    (inline).

### 3. Blade template `resources/views/pdf/stock-history.blade.php`

- A4 portrait, Sarabun font, black-on-white.
- **Header:** logo (left, ~40px tall) + company name; report title (Summary / view title) + SKU + Current (right).
- **Body:** one table for the chosen view, columns matching the on-screen history tables:
  - summary: No / Serial / Receive date / Receive no.
  - issue: No / Doc no / Date-time / Action / Warehouse / Issued by / Requested by / Request no. / Serials
  - receive: No / Doc no / Date-time / Action / Supplier / Reference doc / Warehouse / Cost / Serials / Qty / Note
  - adjust: No / Doc no / Date-time / Reference doc / Action / By / Serials / Qty / Note
  - transfer: No / Doc no / Date-time / Action / From / To / By / Serials / Qty / Note
- **Footer (fixed):** printed date-time + printed-by on the left; **page `counter(page)/counter(pages)`** on the right.
  Rendered with a `<script type="text/php">` block calling `$pdf->page_text(...)` (needs `enable_php`).
- Thead repeats per page (`thead { display: table-header-group }`), rows avoid splitting.

### 4. Frontend

- In `resources/js/pages/stock/item-history.tsx`, the **Print** button becomes a **PDF** button that opens
  the endpoint for the current view in a new tab:
  `window.open('/api/stock-items/' + item.id + '/history/pdf?v=' + (view ?? 'summary'), '_blank')`.
- Keep the existing print CSS as a lightweight fallback is optional; primary path is the PDF.
- i18n: rename/keep the button label (`stock_history_print` → reuse, or add `stock_history_pdf: 'PDF'`).

## Testing

PHPUnit feature tests:

1. **PDF returns a document:** `GET /api/stock-items/{id}/history/pdf?v=summary` → 200,
   `Content-Type: application/pdf`, body starts with `%PDF`.
2. **Each view renders:** issue / receive / adjust / transfer each return 200 application/pdf for a SKU
   that has movements of that type.
3. **Permission:** a user without `stock.view` → 403.
4. **Default view:** no `v` (or invalid) defaults to summary, still 200.

(Rendering exact text/Thai glyphs isn't asserted — only that a valid PDF is produced.)

## Out of scope (YAGNI)

- Signature blocks (not selected).
- Emailing the PDF, saving it to storage, or scheduling.
- Editing report layout from the UI.

## Affected files

- `composer.json` / lock (dompdf), `config/dompdf.php`, `storage/fonts/Sarabun-*.ttf` (new)
- `app/Http/Controllers/Api/StockItemController.php` (extract builder + `historyPdf`)
- `routes/api.php` (pdf route)
- `resources/views/pdf/stock-history.blade.php` (new)
- `resources/js/pages/stock/item-history.tsx` (PDF button)
- `resources/js/lib/i18n.ts` (button label, optional)
- `tests/Feature/StockItemHistoryPdfTest.php` (new)
