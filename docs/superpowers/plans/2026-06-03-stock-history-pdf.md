# Stock Item History — Official PDF (dompdf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate an official, server-rendered A4 PDF of a SKU's history (one document per view: summary / issue / receive / adjust / transfer) with a logo+company header, page x/y + printed-by footer, and embedded Thai font.

**Architecture:** Add `barryvdh/laravel-dompdf` + the Sarabun TTF. Extract the existing history-aggregation into a shared `buildHistory()` method reused by the JSON endpoint and a new `historyPdf()` endpoint that renders a Blade template to PDF. The history page's button opens the PDF inline in a new tab.

**Tech Stack:** Laravel 12 (PHP 8.2), barryvdh/laravel-dompdf, Blade, PHPUnit, React + TS.

**Spec:** `docs/superpowers/specs/2026-06-03-stock-history-pdf-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `composer.json` + lock | dompdf dependency. |
| `config/dompdf.php` (published) | enable_php, font cache/chroot. |
| `storage/fonts/Sarabun-Regular.ttf`, `Sarabun-Bold.ttf` (new) | Thai font. |
| `app/Http/Controllers/Api/StockItemController.php` | `buildHistory()` (extracted) + `historyPdf()`. |
| `routes/api.php` | PDF route. |
| `resources/views/pdf/stock-history.blade.php` (new) | The PDF document. |
| `resources/js/pages/stock/item-history.tsx` | Button → open PDF. |
| `resources/js/lib/i18n.ts` | `stock_history_pdf` label. |
| `tests/Feature/StockItemHistoryPdfTest.php` (new) | Endpoint tests. |

---

## Task 1: Install dompdf + Sarabun font + config

**Files:** `composer.json`, `config/dompdf.php`, `storage/fonts/*.ttf`

- [ ] **Step 1: Require the package**

Run: `composer require barryvdh/laravel-dompdf`
Expected: installs `barryvdh/laravel-dompdf` + `dompdf/dompdf`; package auto-discovery registers the `Pdf` facade (`Barryvdh\DomPDF\Facade\Pdf`).

- [ ] **Step 2: Download the Sarabun TTFs**

Run (creates the dir then fetches both weights from Google Fonts):
```
mkdir -p storage/fonts
curl -sL -o storage/fonts/Sarabun-Regular.ttf https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf
curl -sL -o storage/fonts/Sarabun-Bold.ttf https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf
```
Verify each is a real font: `file storage/fonts/Sarabun-Regular.ttf` → "TrueType Font data".

- [ ] **Step 3: Publish + configure dompdf**

Run: `php artisan vendor:publish --provider="Barryvdh\DomPDF\ServiceProvider"`
Then in `config/dompdf.php`, inside the `'options' => [ ... ]` array set these keys (edit existing keys, don't duplicate):

```php
            // Our Blade is the only template rendered to PDF; PHP is needed for page numbering.
            'enable_php' => true,
            // Allow loading the bundled Sarabun TTF (under the project root) and cache fonts here.
            'font_dir' => storage_path('fonts'),
            'font_cache' => storage_path('fonts'),
            'chroot' => realpath(base_path()),
            'default_font' => 'sarabun',
```

- [ ] **Step 4: Sanity-check the font dir is writable + commit**

Run: `php -r "var_dump(is_writable('storage/fonts'));"` → expect `true` (dompdf writes .ufm cache there).
```
git add composer.json composer.lock config/dompdf.php storage/fonts/Sarabun-Regular.ttf storage/fonts/Sarabun-Bold.ttf
git commit -m "build: add dompdf + Sarabun Thai font for PDF reports"
```

---

## Task 2: Extract a shared `buildHistory()` builder (refactor, no behaviour change)

**Files:** `app/Http/Controllers/Api/StockItemController.php`

- [ ] **Step 1: Add the builder and slim down `history()`**

In `app/Http/Controllers/Api/StockItemController.php`, replace the whole existing `history()` method with the two methods below (this moves the body into `buildHistory()` and reuses the existing `gateView()` helper):

```php
    public function history(Request $request, StockItem $stockItem): JsonResponse
    {
        $this->gateView($request);

        return response()->json(['data' => $this->buildHistory($stockItem)]);
    }

    /**
     * Assemble the full audit history for one SKU: movement timeline, FIFO lots, and
     * per-serial event timelines. Shared by the JSON endpoint and the PDF export.
     *
     * @return array<string, mixed>
     */
    private function buildHistory(StockItem $stockItem): array
    {
        $stockItem->load([
            'movements',
            'lots' => fn ($q) => $q->latest('received_at'),
            'lots.movement',
            'serials.events.movement',
        ]);

        $lotSerials = $stockItem->serials->groupBy('stock_movement_id');

        return [
            'item' => [
                'id' => $stockItem->id,
                'sku' => $stockItem->sku,
                'name' => $stockItem->name,
                'current_stock' => $stockItem->current_stock,
                'track_serial' => (bool) $stockItem->track_serial,
            ],
            'movements' => $stockItem->movements->map(fn ($m) => [
                'id' => $m->id,
                'doc_no' => $m->doc_no,
                'type' => $m->type,
                'qty' => $m->qty,
                'unit_cost' => $m->unit_cost,
                'from_label' => $m->from_label,
                'to_label' => $m->to_label,
                'reference' => $m->reference,
                'recorded_by' => $m->recorded_by,
                'notes' => $m->notes,
                'moved_at' => $m->moved_at?->toIso8601String(),
            ])->values(),
            'lots' => $stockItem->lots->map(fn ($l) => [
                'unit_cost' => $l->unit_cost,
                'qty_received' => $l->qty_received,
                'qty_remaining' => $l->qty_remaining,
                'received_at' => $l->received_at?->toIso8601String(),
                'doc_no' => $l->movement?->doc_no,
                'serials' => ($lotSerials[$l->stock_movement_id] ?? collect())->pluck('serial')->values(),
            ])->values(),
            'serials' => $stockItem->serials->map(fn ($s) => [
                'serial' => $s->serial,
                'status' => $s->status,
                'warehouse' => $s->warehouse,
                'events' => $s->events->map(fn ($e) => [
                    'event' => $e->event,
                    'occurred_at' => $e->occurred_at?->toIso8601String(),
                    'doc_no' => $e->movement?->doc_no,
                    'reference' => $e->reference,
                    'recorded_by' => $e->recorded_by,
                    'from_label' => $e->from_label,
                    'to_label' => $e->to_label,
                ])->values(),
            ])->values(),
        ];
    }
```

- [ ] **Step 2: Verify the JSON history tests still pass**

Run: `php artisan test --compact --filter=StockItemHistoryTest`
Expected: PASS (6 passed) — identical payload, just refactored.

- [ ] **Step 3: Format + commit**

```
vendor/bin/pint --dirty --format agent
git add app/Http/Controllers/Api/StockItemController.php
git commit -m "refactor(stock): extract buildHistory() for reuse"
```

---

## Task 3: PDF endpoint + Blade template (TDD)

**Files:** `tests/Feature/StockItemHistoryPdfTest.php` (new), `routes/api.php`, `app/Http/Controllers/Api/StockItemController.php`, `resources/views/pdf/stock-history.blade.php` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/Feature/StockItemHistoryPdfTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StockItemHistoryPdfTest extends TestCase
{
    use RefreshDatabase;

    private function super(): User
    {
        return User::factory()->create(['role' => 'super']);
    }

    private function item(): StockItem
    {
        $item = StockItem::create([
            'sku' => 'UPS-1', 'name' => 'UPS', 'unit' => 'pcs',
            'current_stock' => 0, 'min_stock' => 1, 'max_stock' => 100, 'track_serial' => true,
        ]);
        // One receive so there is something to render.
        $this->postJson('/api/stock-movements', [
            'type' => 'receive', 'stock_item_id' => $item->id, 'serials' => ['SN-A', 'SN-B'], 'to_label' => 'Main',
        ])->assertCreated();

        return $item;
    }

    public function test_summary_pdf_streams_a_pdf(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $res = $this->get("/api/stock-items/{$item->id}/history/pdf?v=summary");
        $res->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $res->streamedContent());
    }

    public function test_each_view_renders(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        foreach (['issue', 'receive', 'adjust', 'transfer'] as $v) {
            $res = $this->get("/api/stock-items/{$item->id}/history/pdf?v={$v}");
            $res->assertOk();
            $this->assertSame('application/pdf', $res->headers->get('content-type'), "view {$v}");
        }
    }

    public function test_invalid_view_defaults_to_summary(): void
    {
        $this->actingAs($this->super());
        $item = $this->item();

        $this->get("/api/stock-items/{$item->id}/history/pdf?v=bogus")->assertOk();
    }

    public function test_requires_stock_view_permission(): void
    {
        $item = $this->item(); // created as super inside helper
        $user = User::factory()->create(['role' => 'admin']); // no seeded perms
        $this->actingAs($user)->get("/api/stock-items/{$item->id}/history/pdf")->assertForbidden();
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `php artisan test --compact --filter=StockItemHistoryPdfTest`
Expected: FAIL — route `history/pdf` not defined.

- [ ] **Step 3: Add the route**

In `routes/api.php`, next to the existing history route, add (keep both before any `apiResource('stock-items')`):

```php
Route::get('stock-items/{stockItem}/history/pdf', [StockItemController::class, 'historyPdf'])->name('api.stock-items.history-pdf');
```

- [ ] **Step 4: Add the controller action**

In `app/Http/Controllers/Api/StockItemController.php`, add imports near the top:

```php
use App\Models\AppSetting;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;
```

Add the method:

```php
    /** Stream an A4 PDF of one history view (summary|issue|receive|adjust|transfer). */
    public function historyPdf(Request $request, StockItem $stockItem): StreamedResponse
    {
        $this->gateView($request);

        $view = $request->query('v', 'summary');
        if (! in_array($view, ['summary', 'issue', 'receive', 'adjust', 'transfer'], true)) {
            $view = 'summary';
        }

        // Pure nested arrays for the Blade (no Collection surprises in array_filter, etc.).
        $history = json_decode(json_encode($this->buildHistory($stockItem)), true);

        // Logo → base64 data URI so dompdf needs no remote/chroot access for the image.
        $logo = null;
        $logoPath = AppSetting::get('logo_path');
        if ($logoPath && Storage::disk('public')->exists($logoPath)) {
            $logo = 'data:'.Storage::disk('public')->mimeType($logoPath).';base64,'.base64_encode(Storage::disk('public')->get($logoPath));
        }

        $pdf = Pdf::loadView('pdf.stock-history', [
            'history' => $history,
            'view' => $view,
            'logo' => $logo,
            'company' => AppSetting::get('company_name', 'Thai Inaba Foods Co., Ltd.'),
            'printedBy' => $request->user()?->name ?? '',
            'printedAt' => now()->format('Y-m-d H:i'),
        ])->setPaper('a4', 'portrait');

        return $pdf->stream("history-{$stockItem->sku}-{$view}.pdf", ['Attachment' => false]);
    }
```

- [ ] **Step 5: Create the Blade template**

Create `resources/views/pdf/stock-history.blade.php`:

```blade
@php
    $item = $history['item'];
    $fmt = fn ($iso) => $iso ? substr($iso, 0, 10) . ' ' . substr($iso, 11, 5) : '—';
    $movesOf = fn (array $types) => array_values(array_filter($history['movements'], fn ($m) => in_array($m['type'], $types, true)));
    $serialsOf = function (array $m, string $event) use ($history) {
        $out = [];
        foreach ($history['serials'] as $s) {
            foreach ($s['events'] as $e) {
                if ($e['event'] === $event
                    && ((!empty($m['doc_no']) && $e['doc_no'] === $m['doc_no']) || (!empty($m['reference']) && $e['reference'] === $m['reference']))) {
                    $out[] = $s['serial'];
                    break;
                }
            }
        }
        return implode(', ', $out) ?: '—';
    };
    $titles = [
        'summary' => 'Summary', 'issue' => 'Issue history', 'receive' => 'Receive history',
        'adjust' => 'Counting & adjust', 'transfer' => 'Transfer history',
    ];
    $mvLabel = [
        'receive' => 'Receive', 'issue' => 'Issue', 'transfer' => 'Transfer',
        'adjust_up' => 'Adjust +', 'adjust_down' => 'Adjust −', 'return' => 'Return',
    ];
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        body { margin: 0; color: #000; font-size: 11px; }
        .head { width: 100%; border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
        .head td { vertical-align: top; }
        .logo { height: 38px; }
        .company { font-size: 13px; font-weight: bold; }
        .report { font-size: 12px; font-weight: bold; }
        .muted { color: #555; }
        table.data { width: 100%; border-collapse: collapse; }
        table.data th { background: #f0f0f0; border: 0.5px solid #999; padding: 4px 5px; text-align: left; font-size: 10px; }
        table.data td { border: 0.5px solid #ccc; padding: 4px 5px; font-size: 10px; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .r { text-align: right; }
    </style>
</head>
<body>
    {{-- Header --}}
    <table class="head">
        <tr>
            <td style="width:60%;">
                @if ($logo)<img src="{{ $logo }}" class="logo"><br>@endif
                <span class="company">{{ $company }}</span>
            </td>
            <td style="width:40%; text-align:right;">
                <div class="report">{{ $titles[$view] }}</div>
                <div>SKU : <strong>{{ $item['sku'] }}</strong></div>
                <div class="muted">{{ $item['name'] }}</div>
                <div>Current : <strong>{{ $item['current_stock'] }}</strong></div>
            </td>
        </tr>
    </table>

    {{-- Body table per view --}}
    @if ($view === 'summary')
        <table class="data">
            <thead><tr><th>#</th><th>Serial</th><th>Receive date</th><th>Receive no.</th></tr></thead>
            <tbody>
            @forelse ($history['serials'] as $i => $s)
                @php $recv = collect($s['events'])->firstWhere('event', 'received'); @endphp
                <tr><td>{{ $i + 1 }}</td><td>{{ $s['serial'] }}</td><td>{{ $fmt($recv['occurred_at'] ?? null) }}</td><td>{{ $recv['doc_no'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="4" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'issue')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>Warehouse</th><th>Issued by</th><th>Requested by</th><th>Request no.</th><th>Serials</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['issue']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $serialsOf($m, 'issued') }}</td></tr>
            @empty
                <tr><td colspan="9" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'receive')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>Supplier</th><th>Reference doc</th><th>Warehouse</th><th class="r">Cost</th><th>Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['receive']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td class="r">{{ $m['unit_cost'] ?? '—' }}</td><td>{{ $serialsOf($m, 'received') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="11" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @elseif ($view === 'adjust')
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Reference doc</th><th>Action</th><th>By</th><th>Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['adjust_up', 'adjust_down']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $m['reference'] ?? '—' }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $serialsOf($m, 'adjusted') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="9" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @else
        <table class="data">
            <thead><tr><th>#</th><th>Doc no.</th><th>Date/time</th><th>Action</th><th>From</th><th>To</th><th>By</th><th>Serials</th><th class="r">Qty</th><th>Note</th></tr></thead>
            <tbody>
            @forelse ($movesOf(['transfer']) as $i => $m)
                <tr><td>{{ $i + 1 }}</td><td>{{ $m['doc_no'] ?? '—' }}</td><td>{{ $fmt($m['moved_at']) }}</td><td>{{ $mvLabel[$m['type']] ?? $m['type'] }}</td><td>{{ $m['from_label'] ?? '—' }}</td><td>{{ $m['to_label'] ?? '—' }}</td><td>{{ $m['recorded_by'] ?? '—' }}</td><td>{{ $serialsOf($m, 'transferred') }}</td><td class="r">{{ $m['qty'] }}</td><td>{{ $m['notes'] ?? '—' }}</td></tr>
            @empty
                <tr><td colspan="10" style="text-align:center; padding:18px;">No records</td></tr>
            @endforelse
            </tbody>
        </table>
    @endif

    {{-- Footer: printed-by/at (left) + page x/y (right) on every page --}}
    <script type="text/php">
        if (isset($pdf)) {
            $font = $fontMetrics->getFont('Sarabun');
            $w = $pdf->get_width();
            $h = $pdf->get_height();
            $pdf->page_text(36, $h - 28, "{{ $printedAt }}  ·  {{ $printedBy }}", $font, 8, [0.3, 0.3, 0.3]);
            $pdf->page_text($w - 110, $h - 28, "Page {PAGE_NUM}/{PAGE_COUNT}", $font, 8, [0.3, 0.3, 0.3]);
        }
    </script>
</body>
</html>
```

- [ ] **Step 6: Run the tests**

Run: `php artisan test --compact --filter=StockItemHistoryPdfTest`
Expected: PASS (4 passed). If a test errors with a font/cache write error, confirm `storage/fonts` is writable (Task 1 Step 4).

- [ ] **Step 7: Format + commit**

```
vendor/bin/pint --dirty --format agent
git add routes/api.php app/Http/Controllers/Api/StockItemController.php resources/views/pdf/stock-history.blade.php tests/Feature/StockItemHistoryPdfTest.php
git commit -m "feat(stock): official SKU history PDF endpoint (dompdf)"
```

---

## Task 4: Frontend — PDF button

**Files:** `resources/js/pages/stock/item-history.tsx`, `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add the i18n label**

In `resources/js/lib/i18n.ts`, after the English `stock_history_print` key add `stock_history_pdf: 'PDF',`; after the Thai `stock_history_print` key add `stock_history_pdf: 'PDF',`.

- [ ] **Step 2: Point the button at the PDF endpoint**

In `resources/js/pages/stock/item-history.tsx`, replace the Print button's onClick/label:

```tsx
                <button
                    type="button"
                    onClick={() => window.open(`/api/stock-items/${data.item.id}/history/pdf?v=${view ?? 'summary'}`, '_blank')}
                    className="border-border hover:bg-muted/50 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium print:hidden"
                >
                    <Printer className="h-4 w-4" />
                    {t('stock_history_pdf')}
                </button>
```

(`data.item.id` is available in the page; `view` is the current `v` or null.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit -p tsconfig.json` (expect EXIT 0)
Run: `npm run build` (expect success)

- [ ] **Step 4: Commit**

```
git add resources/js/pages/stock/item-history.tsx resources/js/lib/i18n.ts
git commit -m "feat(stock-ui): open official PDF from SKU history"
```

---

## Task 5: Final verification

- [ ] **Step 1:** `php artisan test --compact` → all pass (existing + StockItemHistoryPdfTest 4).
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` → EXIT 0.
- [ ] **Step 3:** `npm run build` → success.
- [ ] **Step 4: Manual smoke (ask the user):** open a serialized SKU's History → click **PDF** → a new tab streams the A4 PDF with the logo + company header, the view's table, and a "Page 1/1" + printed-by footer. **Verify Thai text (company name / any Thai labels) renders as letters, not boxes** — if boxes appear, the Sarabun `@font-face`/`font_cache` needs attention (Task 1 Step 3).

---

## Self-Review Notes

- **Spec coverage:** dompdf + Sarabun + config (Task 1); shared builder DRY (Task 2); PDF endpoint + route + blade with logo/company header, per-view tables, page x/y + printed-by footer, all 5 views (Task 3); frontend button inline-open (Task 4); tests for each view + permission + default (Task 3). All spec sections mapped.
- **Out of scope** honoured: no signatures, no email/save, no UI layout editing.
- **Consistency:** `buildHistory()` returns the same structure the JSON endpoint already shipped (Task 2 keeps `StockItemHistoryTest` green); `historyPdf()` json-encodes it to plain arrays so the Blade's `array_filter`/`array` access is safe; `v` values (`summary|issue|receive|adjust|transfer`) match between route default, controller whitelist, blade `$titles`, and the frontend button; serial-matching in the blade mirrors the page's `serialsOf` (match by doc_no or reference, per event name received/issued/adjusted/transferred). Receive test uses `to_label` (the real `/api/stock-movements` key, consistent with StockItemHistoryTest).
```
