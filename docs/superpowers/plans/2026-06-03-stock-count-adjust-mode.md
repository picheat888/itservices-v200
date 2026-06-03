# Stock Count Auto/Manual Adjust Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose, at commit time, whether a stock count adjusts stock immediately (**Auto**) or is recorded as a report without touching stock (**Manual**).

**Architecture:** Add a `StockCountAdjustMode` enum and an `adjust_mode` column on `stock_counts`. The commit endpoint accepts a `mode` param (default `auto`). `StockCountService::commit()` branches: Auto runs the existing movement/stock/lot logic; Manual skips it and only closes the session. The commit dialog gains a segmented Auto/Manual selector; committed rows show a badge of the mode used.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit, React 19 + TypeScript, Tailwind v4, React Query.

**Spec:** `docs/superpowers/specs/2026-06-03-stock-count-adjust-mode-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app/Enums/StockCountAdjustMode.php` (new) | Enum of the two modes. |
| `database/migrations/<ts>_add_adjust_mode_to_stock_counts.php` (new) | Adds nullable `adjust_mode` column. |
| `app/Models/StockCount.php` | Fillable + enum cast for `adjust_mode`. |
| `app/Http/Resources/StockCountResource.php` | Exposes `adjust_mode`. |
| `app/Services/StockCountService.php` | `commit()` branches on mode. |
| `app/Http/Controllers/Api/StockCountController.php` | Validates `mode`, resolves enum, passes to service. |
| `tests/Feature/StockCountTest.php` | Tests for manual / auto / default. |
| `resources/js/types/index.ts` | `StockCountAdjustMode` type + field. |
| `resources/js/services/stockApi.ts` | `commit(id, mode)`. |
| `resources/js/hooks/use-stock.ts` | `commit` mutation takes `{ id, mode }`. |
| `resources/js/lib/i18n.ts` | Mode labels / hints / badges (en + th). |
| `resources/js/pages/stock/index.tsx` | Commit dialog selector + list badge. |

---

## Task 1: Backend scaffolding (enum, migration, model, resource)

Infra only — no behaviour change yet. `adjust_mode` stays null until commit handles it (Task 2).

**Files:**
- Create: `app/Enums/StockCountAdjustMode.php`
- Create: `database/migrations/<ts>_add_adjust_mode_to_stock_counts.php`
- Modify: `app/Models/StockCount.php`
- Modify: `app/Http/Resources/StockCountResource.php`

- [ ] **Step 1: Create the enum**

Create `app/Enums/StockCountAdjustMode.php`:

```php
<?php

namespace App\Enums;

/** How committing a stock count affects stock levels. */
enum StockCountAdjustMode: string
{
    case Auto = 'auto';
    case Manual = 'manual';
}
```

- [ ] **Step 2: Generate the migration**

Run:
```
php artisan make:migration add_adjust_mode_to_stock_counts --table=stock_counts --no-interaction
```

- [ ] **Step 3: Fill in the migration**

Replace the generated file body with:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_counts', function (Blueprint $table) {
            // null while draft; set to 'auto' or 'manual' at commit.
            $table->string('adjust_mode')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('stock_counts', function (Blueprint $table) {
            $table->dropColumn('adjust_mode');
        });
    }
};
```

- [ ] **Step 4: Run the migration**

Run: `php artisan migrate --no-interaction`
Expected: migrates `add_adjust_mode_to_stock_counts` with `DONE`.

- [ ] **Step 5: Add fillable + cast on the model**

In `app/Models/StockCount.php`, replace the `$fillable` line and `casts()` method:

```php
    protected $fillable = ['reference', 'warehouse', 'category', 'status', 'adjust_mode', 'note', 'counted_by', 'committed_at'];

    protected function casts(): array
    {
        return [
            'status' => StockCountStatus::class,
            'adjust_mode' => StockCountAdjustMode::class,
            'committed_at' => 'datetime',
        ];
    }
```

Add the import at the top, next to the existing `use App\Enums\StockCountStatus;`:

```php
use App\Enums\StockCountAdjustMode;
```

- [ ] **Step 6: Expose `adjust_mode` in the resource**

In `app/Http/Resources/StockCountResource.php`, add this line right after the `'status'` line:

```php
            'adjust_mode' => $this->adjust_mode?->value,
```

- [ ] **Step 7: Confirm existing tests still pass**

Run: `php artisan test --compact --filter=StockCountTest`
Expected: all existing tests PASS (6 passed). `adjust_mode` is null on existing flows — nothing broke.

- [ ] **Step 8: Format + commit**

```
vendor/bin/pint --dirty --format agent
```

```
git add app/Enums/StockCountAdjustMode.php database/migrations/*_add_adjust_mode_to_stock_counts.php app/Models/StockCount.php app/Http/Resources/StockCountResource.php
git commit -m "feat(stock): scaffold adjust_mode on stock counts"
```

---

## Task 2: Commit branches on mode (TDD)

**Files:**
- Test: `tests/Feature/StockCountTest.php`
- Modify: `app/Http/Controllers/Api/StockCountController.php`
- Modify: `app/Services/StockCountService.php`

- [ ] **Step 1: Write the failing tests**

In `tests/Feature/StockCountTest.php`, add these three methods before the closing brace:

```php
    public function test_manual_commit_is_report_only(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 4]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'manual'])
            ->assertOk()
            ->assertJsonPath('data.status', 'committed')
            ->assertJsonPath('data.adjust_mode', 'manual');

        // Report only: stock untouched, no movements recorded.
        $this->assertSame(10, $item->fresh()->current_stock);
        $this->assertSame(0, StockMovement::count());
    }

    public function test_auto_commit_persists_mode_and_adjusts(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 7]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", ['mode' => 'auto'])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(7, $item->fresh()->current_stock);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'adjust_down', 'qty' => 3]);
    }

    public function test_commit_without_mode_defaults_to_auto(): void
    {
        $item = $this->item('A-1', 10);
        $this->actingAs($this->super());
        $count = $this->postJson('/api/stock-counts', [])->json('data');
        $lineId = $count['lines'][0]['id'];
        $this->putJson("/api/stock-counts/{$count['id']}", ['counts' => [$lineId => 8]])->assertOk();

        $this->postJson("/api/stock-counts/{$count['id']}/commit", [])
            ->assertOk()
            ->assertJsonPath('data.adjust_mode', 'auto');

        $this->assertSame(8, $item->fresh()->current_stock);
    }
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `php artisan test --compact --filter=StockCountTest`
Expected: `test_manual_commit_is_report_only` FAILS — manual still adjusts stock (current_stock becomes 4, a movement exists) and `adjust_mode` is null. The auto/default tests fail on the `adjust_mode` path assertion (null, not `'auto'`).

- [ ] **Step 3: Accept `mode` in the controller**

In `app/Http/Controllers/Api/StockCountController.php`, replace the `commit()` method with:

```php
    public function commit(Request $request, StockCount $stockCount): JsonResponse
    {
        $this->gate($request);
        $data = $request->validate([
            'mode' => ['nullable', 'in:auto,manual'],
        ]);
        $mode = StockCountAdjustMode::from($data['mode'] ?? 'auto');
        $count = $this->service->commit($stockCount, $request->user(), $mode);

        return (new StockCountResource($count->load(['countedBy', 'lines.item'])))
            ->additional(['message' => 'success'])->response();
    }
```

Add the import near the other `use` statements at the top:

```php
use App\Enums\StockCountAdjustMode;
```

- [ ] **Step 4: Branch on mode in the service**

In `app/Services/StockCountService.php`, replace the `commit()` method with:

```php
    /**
     * Commit a draft. In Auto mode, every counted line whose count differs from
     * system stock records an adjust_up/adjust_down movement, sets the item's
     * current_stock to the counted value, and reconciles FIFO lots. In Manual
     * mode the session is closed as a report only — stock is left untouched.
     * The chosen mode is persisted on the count.
     */
    public function commit(StockCount $count, User $user, StockCountAdjustMode $mode = StockCountAdjustMode::Auto): StockCount
    {
        abort_unless($count->status === StockCountStatus::Draft, 422, 'Count is already closed.');

        DB::transaction(function () use ($count, $user, $mode) {
            if ($mode === StockCountAdjustMode::Auto) {
                foreach ($count->lines()->with('item')->get() as $line) {
                    $variance = $line->variance();
                    if ($variance === null || $variance === 0 || $line->item === null) {
                        continue;
                    }

                    StockMovement::create([
                        'type' => $variance > 0 ? 'adjust_up' : 'adjust_down',
                        'stock_item_id' => $line->stock_item_id,
                        'qty' => abs($variance),
                        'reference' => $count->reference,
                        'recorded_by' => $user->name,
                        'user_id' => $user->id,
                        'notes' => 'Stock count adjustment',
                        'moved_at' => now(),
                    ]);

                    $line->item->update([
                        'current_stock' => $line->counted_qty,
                        'last_move_at' => now()->toDateString(),
                    ]);

                    // Realign FIFO lots with the counted quantity.
                    $this->lotService->reconcile($line->item, $line->counted_qty);
                }
            }

            $count->update([
                'status' => StockCountStatus::Committed,
                'committed_at' => now(),
                'adjust_mode' => $mode,
            ]);
        });

        AuditLog::record(
            'Committed stock count',
            $count->reference.($mode === StockCountAdjustMode::Manual ? ' (manual — report only)' : ' (auto — stock adjusted)')
        );

        return $count->fresh('lines');
    }
```

Add the import near the other `use` statements at the top:

```php
use App\Enums\StockCountAdjustMode;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `php artisan test --compact --filter=StockCountTest`
Expected: all PASS (9 passed) — the three new tests plus the six existing ones (the existing `test_uncounted_lines_are_untouched_and_recommit_blocked` still passes because default mode is auto and an all-null count produces no movements).

- [ ] **Step 6: Format + commit**

```
vendor/bin/pint --dirty --format agent
```

```
git add app/Services/StockCountService.php app/Http/Controllers/Api/StockCountController.php tests/Feature/StockCountTest.php
git commit -m "feat(stock): commit honors auto/manual adjust mode"
```

---

## Task 3: Frontend types, API, hook

**Files:**
- Modify: `resources/js/types/index.ts`
- Modify: `resources/js/services/stockApi.ts`
- Modify: `resources/js/hooks/use-stock.ts`

- [ ] **Step 1: Add the type + field**

In `resources/js/types/index.ts`, add after the `StockCountStatus` type (line ~393):

```ts
export type StockCountAdjustMode = 'auto' | 'manual';
```

In the `StockCount` interface, add this field after `status`:

```ts
    adjust_mode: StockCountAdjustMode | null;
```

- [ ] **Step 2: Update the API call**

In `resources/js/services/stockApi.ts`, add `StockCountAdjustMode` to the type import on line 1:

```ts
import type { ApiEnvelope, StockCount, StockCountAdjustMode, StockItem, StockMovement, StockMovementType, StockRequest, StockSummary } from '@/types';
```

Replace the `commit` line in `stockCountApi`:

```ts
    commit: (id: number, mode: StockCountAdjustMode = 'auto') => mutate<StockCount>('post', `/stock-counts/${id}/commit`, { mode }),
```

- [ ] **Step 3: Update the mutation hook**

In `resources/js/hooks/use-stock.ts`, replace the `commit` mutation line:

```ts
        commit: useMutation({ mutationFn: (v: { id: number; mode: StockCountAdjustMode }) => stockCountApi.commit(v.id, v.mode), onSuccess: inv }),
```

Ensure `StockCountAdjustMode` is imported from `@/types` (add it to the existing type import in this file).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 in this file, BUT `pages/stock/index.tsx` will now error because `commit.mutateAsync(session.id)` no longer matches `{ id, mode }`. That is expected and fixed in Task 5. If you want a green check now, proceed to Task 5 before re-running.

- [ ] **Step 5: Commit**

```
git add resources/js/types/index.ts resources/js/services/stockApi.ts resources/js/hooks/use-stock.ts
git commit -m "feat(stock-ui): types/api/hook for commit adjust mode"
```

---

## Task 4: i18n keys

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add English keys**

In `resources/js/lib/i18n.ts`, after the English `stock_count_commit` line (~line 472), add:

```ts
    stock_count_mode_auto: 'Auto — adjust stock now',
    stock_count_mode_manual: 'Manual — report only',
    stock_count_mode_auto_hint: 'Applies the counted quantities to stock and records adjustment movements.',
    stock_count_mode_manual_hint: 'Records the count as a report. Stock is not changed.',
    stock_count_mode_badge_auto: 'Stock adjusted',
    stock_count_mode_badge_manual: 'Report only',
```

- [ ] **Step 2: Add Thai keys**

After the Thai `stock_count_commit` line (~line 1293), add:

```ts
    stock_count_mode_auto: 'อัตโนมัติ — ปรับสต็อกทันที',
    stock_count_mode_manual: 'แมนนวล — บันทึกเป็นรายงาน',
    stock_count_mode_auto_hint: 'นำยอดที่นับได้ไปปรับสต็อกและบันทึก movement ทันที',
    stock_count_mode_manual_hint: 'บันทึกการนับเป็นรายงาน ไม่ปรับสต็อก',
    stock_count_mode_badge_auto: 'ปรับสต็อก',
    stock_count_mode_badge_manual: 'รายงาน',
```

- [ ] **Step 3: Typecheck (i18n shape)**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no NEW errors from `i18n.ts` (the en/th key sets must match — if a key is missing on one side TS will flag it). The `stock/index.tsx` error from Task 3 may still be present until Task 5.

- [ ] **Step 4: Commit**

```
git add resources/js/lib/i18n.ts
git commit -m "feat(stock-ui): i18n for count adjust mode"
```

---

## Task 5: Commit dialog mode selector + wire-up

Functional baseline; visual polish happens in Task 7 with frontend-design.

**Files:**
- Modify: `resources/js/pages/stock/index.tsx`

- [ ] **Step 1: Import the type**

Ensure `StockCountAdjustMode` is imported from `@/types` in `pages/stock/index.tsx` (add to the existing type import, alongside `StockItem`).

- [ ] **Step 2: Add mode state**

In `AuditTab`, next to the other `useState` declarations (~line 1158, after `entries`), add:

```tsx
    const [mode, setMode] = useState<StockCountAdjustMode>('auto');
```

- [ ] **Step 3: Replace the dialog footer**

Find the `{isDraft && can('audit') && ( <DialogFooter> ... </DialogFooter> )}` block (~line 1507) and replace the whole block with:

```tsx
                            {isDraft && can('audit') && (
                                <DialogFooter className="flex-col items-stretch gap-3">
                                    {/* Auto/Manual selector — Manual commits as a report without touching stock. */}
                                    <div className="flex gap-2">
                                        {(['auto', 'manual'] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => setMode(m)}
                                                className={cn(
                                                    'flex-1 rounded-lg border px-3 py-2 text-left text-xs transition',
                                                    mode === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                                                )}
                                            >
                                                <div className="font-semibold">
                                                    {t(m === 'auto' ? 'stock_count_mode_auto' : 'stock_count_mode_manual')}
                                                </div>
                                                <div className="text-muted-foreground mt-0.5">
                                                    {t(m === 'auto' ? 'stock_count_mode_auto_hint' : 'stock_count_mode_manual_hint')}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => save.mutate({ id: session.id, counts: countsPayload() }, { onError })}
                                        >
                                            {t('stock_count_save')}
                                        </Button>
                                        <Button
                                            disabled={!anyCounted || save.isPending || commit.isPending}
                                            onClick={async () => {
                                                // Persist on-screen counts first, then commit with the chosen mode.
                                                try {
                                                    await save.mutateAsync({ id: session.id, counts: countsPayload() });
                                                    await commit.mutateAsync({ id: session.id, mode });
                                                } catch (e) {
                                                    onError(e);
                                                }
                                            }}
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                            {t('stock_count_commit')}
                                        </Button>
                                    </div>
                                </DialogFooter>
                            )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0 (the Task 3 error is now resolved — `commit.mutateAsync` receives `{ id, mode }`).

- [ ] **Step 5: Commit**

```
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock-ui): commit dialog auto/manual selector"
```

---

## Task 6: Mode badge in the session list

**Files:**
- Modify: `resources/js/pages/stock/index.tsx`

- [ ] **Step 1: Show the mode on committed rows**

Find the `status` column in `sessionColumns` (~line 1254) and replace its `render` with:

```tsx
            render: (s) => (
                <div className="flex items-center gap-1.5">
                    <StatusBadge tone={statusTone(s.status)}>{t(`stock_count_${s.status}` as Parameters<typeof t>[0])}</StatusBadge>
                    {s.status === 'committed' && s.adjust_mode && (
                        <span className="text-muted-foreground text-[11px]">
                            {s.adjust_mode === 'manual' ? t('stock_count_mode_badge_manual') : t('stock_count_mode_badge_auto')}
                        </span>
                    )}
                </div>
            ),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```
git add resources/js/pages/stock/index.tsx
git commit -m "feat(stock-ui): show adjust mode badge on committed counts"
```

---

## Task 7: Visual polish + final verification

**Files:**
- Modify: `resources/js/pages/stock/index.tsx` (polish only)

- [ ] **Step 1: Polish the selector with frontend-design**

Invoke the **frontend-design** skill to refine the Auto/Manual selector and the commit dialog: clear selected/unselected states, an icon per mode (e.g. a lightning/auto vs a document/report icon), and a short inline warning when Manual is selected ("Stock will not change"). Keep it Tailwind-only and consistent with the existing dialog styling. Do not change behaviour or the `mode` wiring.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: EXIT 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (auto-fixes applied).

- [ ] **Step 4: Full count test suite**

Run: `php artisan test --compact --filter=StockCountTest`
Expected: all PASS (9 passed).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual smoke (ask the user to run the app)**

In the Counting tab: open a count → enter quantities → Commit → pick **Manual** → confirm. Verify: status shows committed with the "รายงาน / Report only" badge, stock is unchanged, no new movement. Repeat with **Auto** → stock adjusts and an adjust movement appears.

- [ ] **Step 7: Commit any polish changes**

```
git add resources/js/pages/stock/index.tsx
git commit -m "style(stock-ui): polish auto/manual commit selector"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), backend branch + persisted mode (Task 2), API `mode` param + resource field (Tasks 1–2), frontend types/api/hook (Task 3), i18n (Task 4), commit selector (Task 5), list badge (Task 6), tests for manual/auto/default (Task 2), frontend-design polish (Task 7). All spec sections mapped.
- **Out of scope** honoured: no per-line apply, no global setting, no re-commit.
- **Type consistency:** `StockCountAdjustMode` ('auto'|'manual') used identically across enum, resource (`->value`), TS type, api, hook, and components. `commit` mutation signature `{ id, mode }` matches in hook (Task 3) and caller (Task 5).
