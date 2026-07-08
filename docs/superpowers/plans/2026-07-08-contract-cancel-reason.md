# Contract Cancel Reason Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require and store a reason when a contract is cancelled, validated on the backend and captured through a dedicated cancel dialog.

**Architecture:** Add a nullable `contracts.cancel_reason` column. The existing toggle cancel endpoint validates a required `reason` only in the cancelling direction (reactivation sends none and clears the stored reason). The frontend replaces the plain confirm-dialog cancel path with a dedicated dialog that has a required reason textarea.

**Tech Stack:** Laravel 12 (PHP 8.2), PHPUnit 11 feature tests (SQLite via `RefreshDatabase`), React 19 + TypeScript, TanStack Query, Tailwind v4, i18n via `useT()`.

## Global Constraints

- **API response format:** success returns `{ "data": {...}, "message": "success" }` via `ContractResource`; validation errors return `422` with `{ "message", "errors": { "field": [...] } }`.
- **DB columns are `snake_case`; PHP methods are `camelCase`.**
- **No business logic in controllers** — it lives in `App\Services\Contract\ContractService`.
- **Every changed/new PHP method keeps a docblock.**
- **Frontend: no hardcoded UI strings** — all copy via `useT()`, keys added to BOTH `lang/en/contract.ts` and `lang/th/contract.ts`. **No inline `style=`.**
- **Validation rule:** `reason` is `required|string|max:500` when cancelling. Laravel's default `TrimStrings` + `ConvertEmptyStringsToNull` middleware (active — not removed in `bootstrap/app.php`) turn a whitespace-only reason into `null`, so plain `required` rejects it.
- **After any PHP change** run `vendor/bin/pint --dirty --format agent`.
- **Run backend tests** with `php artisan test --compact --filter=ContractApiTest`.
- **Scope:** Cancel only — the **Expire** action and its tests are untouched. Reactivation stays a plain toggle needing no reason.

---

## File Structure

**Backend**
- `database/migrations/2026_07_08_010000_add_cancel_reason_to_contracts_table.php` — **create**. Nullable `cancel_reason` text column.
- `app/Models/Contract/Contract.php:34-36` — **modify**. Add `cancel_reason` to `$fillable`.
- `app/Http/Resources/Contract/ContractResource.php:65-66` — **modify**. Expose `cancel_reason`.
- `app/Http/Controllers/Api/Contract/ContractController.php:219-230` — **modify**. Direction-aware `reason` validation.
- `app/Services/Contract/ContractService.php:196-208` — **modify**. `toggleCancel` stores/clears the reason.
- `tests/Feature/ContractApiTest.php` — **modify**. New reason tests + update existing cancel tests to send a reason.

**Frontend**
- `resources/js/shared/types/index.ts:197-198` — **modify**. `Contract` gains `cancel_reason`.
- `resources/js/modules/contract/api/contractApi.ts:59` — **modify**. `cancel(id, reason?)`.
- `resources/js/modules/contract/hooks/use-contracts.ts:58` — **modify**. cancel mutation takes `{ id, reason? }`.
- `resources/js/modules/contract/components/contract-cancel-dialog.tsx` — **create**. The reason dialog.
- `resources/js/modules/contract/components/contract-detail-drawer.tsx` — **modify**. Open the dialog instead of the confirm.
- `resources/js/lang/en/contract.ts`, `resources/js/lang/th/contract.ts` — **modify**. New keys.

---

## Task 1: Backend — column, validation, storage

**Files:**
- Create: `database/migrations/2026_07_08_010000_add_cancel_reason_to_contracts_table.php`
- Modify: `app/Models/Contract/Contract.php:34-36`, `app/Http/Resources/Contract/ContractResource.php:65-66`, `app/Http/Controllers/Api/Contract/ContractController.php:219-230`, `app/Services/Contract/ContractService.php:196-208`
- Test: `tests/Feature/ContractApiTest.php`

**Interfaces:**
- Produces: column `contracts.cancel_reason` (nullable text); `ContractService::toggleCancel(Contract $contract, ?string $reason = null): Contract`; `ContractResource` key `cancel_reason` (string|null); `POST /contracts/{contract}/cancel` accepts `reason` (required when cancelling).

- [ ] **Step 1: Write the failing tests**

Add these four tests to `tests/Feature/ContractApiTest.php` (before the final `}`):

```php
public function test_cancel_requires_a_reason(): void
{
    $this->actingAs($this->super());
    $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

    $this->postJson("/api/contracts/{$contract->id}/cancel")
        ->assertStatus(422)->assertJsonValidationErrors('reason');
    $this->assertNull($contract->fresh()->cancelled_at);
}

public function test_cancel_with_a_reason_stores_it(): void
{
    $this->actingAs($this->super());
    $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

    $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Vendor no longer used'])
        ->assertOk()
        ->assertJsonPath('data.status', 'cancelled')
        ->assertJsonPath('data.cancel_reason', 'Vendor no longer used');
    $this->assertSame('Vendor no longer used', $contract->fresh()->cancel_reason);
}

public function test_cancel_rejects_a_whitespace_only_reason(): void
{
    $this->actingAs($this->super());
    $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);

    // TrimStrings + ConvertEmptyStringsToNull turn "   " into null → required fails.
    $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => '   '])
        ->assertStatus(422)->assertJsonValidationErrors('reason');
    $this->assertNull($contract->fresh()->cancelled_at);
}

public function test_reactivate_clears_the_reason_and_needs_none(): void
{
    $this->actingAs($this->super());
    $contract = Contract::create(['vendor' => 'A', 'name' => 'N', 'type' => 'software', 'start_date' => now()->subYear(), 'end_date' => now()->addDays(90), 'value' => 1, 'billing_cycle' => 'yearly']);
    $contract->update(['cancelled_at' => now(), 'cancel_reason' => 'Old reason']);

    // Reactivation (already cancelled) takes no reason and clears the stored one.
    $this->postJson("/api/contracts/{$contract->id}/cancel")
        ->assertOk()
        ->assertJsonPath('data.status', 'active')
        ->assertJsonPath('data.cancel_reason', null);
    $this->assertNull($contract->fresh()->cancelled_at);
    $this->assertNull($contract->fresh()->cancel_reason);
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `php artisan test --compact --filter='test_cancel_requires_a_reason|test_cancel_with_a_reason_stores_it|test_cancel_rejects_a_whitespace_only_reason|test_reactivate_clears_the_reason_and_needs_none'`
Expected: FAIL — `cancel_reason` column/key missing; cancel currently succeeds without a reason.

- [ ] **Step 3: Create the migration**

Create `database/migrations/2026_07_08_010000_add_cancel_reason_to_contracts_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Record why a contract was cancelled (captured + required at cancel time). */
    public function up(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->text('cancel_reason')->nullable()->after('expired_at');
        });
    }

    public function down(): void
    {
        Schema::table('contracts', function (Blueprint $table) {
            $table->dropColumn('cancel_reason');
        });
    }
};
```

- [ ] **Step 4: Add `cancel_reason` to the model `$fillable`**

In `app/Models/Contract/Contract.php`, change the `$fillable` array (lines 34-36) so `cancel_reason` follows `expired_at`:

```php
    protected $fillable = [
        'code', 'vendor_id', 'name', 'title', 'type', 'start_date', 'end_date',
        'value', 'billing_cycle', 'cancelled_at', 'expired_at', 'cancel_reason',
        'notify_150', 'notify_120', 'notify_90', 'notify_60', 'notify_45', 'notify_30', 'notify_7', 'notes',
    ];
```

- [ ] **Step 5: Expose `cancel_reason` in the resource**

In `app/Http/Resources/Contract/ContractResource.php`, add the key right after `expired_at` (line 66):

```php
            'cancelled_at' => $this->cancelled_at?->toDateString(),
            'expired_at' => $this->expired_at?->toDateString(),
            'cancel_reason' => $this->cancel_reason,
```

- [ ] **Step 6: Direction-aware validation in the controller**

In `app/Http/Controllers/Api/Contract/ContractController.php`, replace the `cancel` method (lines 219-230):

```php
    /**
     * Toggles a contract's cancelled state. Requires the contracts.cancel permission.
     * Cancelling requires a reason (stored on the contract); reactivating takes none.
     */
    public function cancel(Request $request, Contract $contract): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.cancel'), 403);

        // Reason is mandatory only in the active → cancelled direction.
        $isCancelling = $contract->cancelled_at === null;
        $validated = $request->validate([
            'reason' => [$isCancelling ? 'required' : 'nullable', 'string', 'max:500'],
        ]);
        $reason = $isCancelling ? $validated['reason'] : null;

        $contract = $this->service->toggleCancel($contract, $reason);

        if ($contract->cancelled_at !== null) {
            AuditLog::record('Cancelled contract', "{$contract->name} ({$contract->code}) — {$reason}");
        } else {
            AuditLog::record('Reactivated contract', "{$contract->name} ({$contract->code})");
        }

        return (new ContractResource($contract))
            ->additional(['message' => 'success'])->response();
    }
```

- [ ] **Step 7: Store/clear the reason in the service**

In `app/Services/Contract/ContractService.php`, replace the `toggleCancel` method (lines 196-208):

```php
    /**
     * Toggle a contract's cancelled state: cancel an active contract (storing the
     * given reason), or reactivate a cancelled one (clearing the reason). Used by
     * the detail drawer.
     */
    public function toggleCancel(Contract $contract, ?string $reason = null): Contract
    {
        $cancelling = $contract->cancelled_at === null;

        // Guard only the active → cancelled transition; reactivation is always allowed.
        if ($cancelling) {
            $this->assertNoPendingAssets($contract);
        }

        $contract->update([
            'cancelled_at' => $cancelling ? Carbon::now() : null,
            'cancel_reason' => $cancelling ? $reason : null,
        ]);

        return $contract->fresh();
    }
```

- [ ] **Step 8: Update existing cancel tests to send a reason**

The existing cancel tests POST without a reason and now need one to reach the success path or the asset guard (permission tests are unaffected — the `abort_unless` runs before validation). Apply these edits in `tests/Feature/ContractApiTest.php`:

In `test_cancel_toggles_the_contract_status` — add a reason to the first (cancelling) POST only; the second POST reactivates and stays reasonless:

```php
        // Cancel.
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'No longer needed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
        $this->assertNotNull($contract->fresh()->cancelled_at);
```

In `test_hardware_contract_cannot_be_cancelled_while_a_linked_asset_is_not_written_off` — send a reason so validation passes and the asset guard (the `contract` error) is what fires:

```php
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Ending lease'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contract');
```

In `test_hardware_contract_cancels_once_every_linked_asset_is_written_off` — add a reason to the POST:

```php
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Ending lease'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
```

In `test_non_hardware_contract_is_blocked_from_cancel_until_linked_asset_is_written_off` — add a reason to BOTH POSTs (the blocked one and the later success one):

```php
        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Service ended'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('contract');
        $this->assertNull($contract->fresh()->cancelled_at);

        // Once the linked asset is written off, cancellation proceeds normally.
        $asset->update(['status' => 'writeoff']);

        $this->postJson("/api/contracts/{$contract->id}/cancel", ['reason' => 'Service ended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
```

- [ ] **Step 9: Run the full ContractApiTest suite**

Run: `php artisan test --compact --filter=ContractApiTest`
Expected: PASS (the 4 new tests + all existing, including the updated cancel tests and the untouched expire/permission tests).

- [ ] **Step 10: Format + commit**

```bash
vendor/bin/pint --dirty --format agent
git add database/migrations/2026_07_08_010000_add_cancel_reason_to_contracts_table.php app/Models/Contract/Contract.php app/Http/Resources/Contract/ContractResource.php app/Http/Controllers/Api/Contract/ContractController.php app/Services/Contract/ContractService.php tests/Feature/ContractApiTest.php
git commit -m "feat(contract): require and store a reason when cancelling a contract"
```

---

## Task 2: Frontend — cancel dialog with required reason

**Files:**
- Modify: `resources/js/shared/types/index.ts:197-198`, `resources/js/modules/contract/api/contractApi.ts:59`, `resources/js/modules/contract/hooks/use-contracts.ts:58`
- Create: `resources/js/modules/contract/components/contract-cancel-dialog.tsx`
- Modify: `resources/js/modules/contract/components/contract-detail-drawer.tsx`
- Modify: `resources/js/lang/en/contract.ts`, `resources/js/lang/th/contract.ts`

**Interfaces:**
- Consumes: `Contract.cancel_reason` (Task 1); `contractApi.cancel`; `useContractMutations().cancel`.
- Produces: `ContractCancelDialog` component (`{ contract, onClose, onDone }`); `contractApi.cancel(id: number, reason?: string)`; cancel mutation input `{ id: number; reason?: string }`.

- [ ] **Step 1: Extend the `Contract` type**

In `resources/js/shared/types/index.ts`, add the field right after `expired_at` (line 198):

```ts
    cancelled_at: string | null;
    expired_at: string | null;
    cancel_reason: string | null;
```

- [ ] **Step 2: Update the API `cancel` call**

In `resources/js/modules/contract/api/contractApi.ts`, replace the `cancel` line (59):

```ts
    cancel: (id: number, reason?: string) => mutate<Contract>('post', `/contracts/${id}/cancel`, reason !== undefined ? { reason } : {}),
```

- [ ] **Step 3: Update the hook mutation**

In `resources/js/modules/contract/hooks/use-contracts.ts`, replace the `cancel` mutation (line 58):

```ts
        cancel: useMutation({ mutationFn: (v: { id: number; reason?: string }) => contractApi.cancel(v.id, v.reason), onSuccess: invalidate }),
```

- [ ] **Step 4: Add i18n keys (en + th)**

In `resources/js/lang/en/contract.ts`, add before the closing `};`:

```ts
    "contract_cancel_confirm_title": "Cancel this contract?",
    "contract_cancel_reason": "Reason for cancellation",
    "contract_cancel_reason_ph": "e.g. Vendor no longer used, replaced by a new contract…",
    "contract_cancel_reason_required": "Please provide a reason",
    "contract_cancel_failed": "Cancellation failed",
```

In `resources/js/lang/th/contract.ts`, add before the closing `};`:

```ts
    "contract_cancel_confirm_title": "ยืนยันยกเลิกสัญญา?",
    "contract_cancel_reason": "เหตุผลการยกเลิก",
    "contract_cancel_reason_ph": "เช่น เลิกใช้ผู้ให้บริการ, เปลี่ยนไปใช้สัญญาใหม่ ฯลฯ",
    "contract_cancel_reason_required": "กรุณาระบุเหตุผล",
    "contract_cancel_failed": "ยกเลิกไม่สำเร็จ",
```

- [ ] **Step 5: Create the cancel dialog component**

Create `resources/js/modules/contract/components/contract-cancel-dialog.tsx`:

```tsx
import { Field } from '@/shared/components/field';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { useContractMutations } from '../hooks/use-contracts';
import { useT } from '@/lang';
import type { Contract } from '@/shared/types';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Cancel a contract with a required reason (reversible early termination). */
export function ContractCancelDialog({
    contract,
    onClose,
    onDone,
}: {
    contract: Contract | null;
    onClose: () => void;
    onDone: () => void;
}) {
    const t = useT();
    const { cancel } = useContractMutations();
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | undefined>();

    // Reset the field each time a (different) contract opens the dialog.
    useEffect(() => {
        if (contract) {
            setReason('');
            setError(undefined);
        }
    }, [contract]);

    const submit = async () => {
        if (!reason.trim()) {
            setError(t('contract_cancel_reason_required'));
            return;
        }
        if (!contract) return;
        try {
            await cancel.mutateAsync({ id: contract.id, reason: reason.trim() });
            onDone();
        } catch {
            setError(t('contract_cancel_failed'));
        }
    };

    return (
        <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Ban className="text-destructive h-5 w-5" />
                        {t('contract_cancel_confirm_title')}
                    </DialogTitle>
                    {contract && (
                        <DialogDescription>
                            {contract.name} · {contract.code}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <Field label={t('contract_cancel_reason')} required error={error}>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={t('contract_cancel_reason_ph')}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                </Field>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
                        <Ban className="h-4 w-4" />
                        {t('contract_cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 6: Wire the dialog into the detail drawer**

In `resources/js/modules/contract/components/contract-detail-drawer.tsx`:

(a) Add the import near the other component imports (top of file):

```tsx
import { ContractCancelDialog } from './contract-cancel-dialog';
```

(b) The drawer no longer calls `cancel` directly — change the mutations destructure (line 64) to drop `cancel`:

```tsx
    const { expire } = useContractMutations();
```

(c) Add cancel-dialog state next to the `tab` state (after line 65):

```tsx
    const [cancelling, setCancelling] = useState(false);
```

(d) Replace the `handleCancel` function (lines 104-117) — after the asset guard it just opens the dialog:

```tsx
    /** Cancel = reversible early termination; opens the reason dialog once assets are clear. */
    const handleCancel = async () => {
        if (!(await assertAssetsClear())) return;
        setCancelling(true);
    };
```

(e) The footer Cancel button (line 312) no longer has a pending state of its own — remove the `disabled`:

```tsx
                        {canCancel && (
                            <Button variant="destructive" onClick={handleCancel}>
                                <Ban className="h-4 w-4" />
                                {t('contract_cancel')}
                            </Button>
                        )}
```

(f) Render the dialog as a sibling of the detail `Dialog`. Wrap the returned `<Dialog>…</Dialog>` (lines ~150-332) in a fragment and add the cancel dialog after it. Concretely, change the opening `return (` to `return (\n        <>` , change the closing `</Dialog>\n    );` to `</Dialog>\n            <ContractCancelDialog\n                contract={cancelling ? c : null}\n                onClose={() => setCancelling(false)}\n                onDone={() => {\n                    setCancelling(false);\n                    onClose();\n                }}\n            />\n        </>\n    );`:

```tsx
        </Dialog>
            <ContractCancelDialog
                contract={cancelling ? c : null}
                onClose={() => setCancelling(false)}
                onDone={() => {
                    setCancelling(false);
                    onClose();
                }}
            />
        </>
    );
```

(Make sure the `return (` now opens with `<>` before `<Dialog …>`.)

- [ ] **Step 7: Verify the frontend type-checks and builds**

Run: `npm run build` (and `npx tsc --noEmit` if available)
Expected: green, 0 TypeScript errors. Confirm no remaining reference to `cancel.isPending` in `contract-detail-drawer.tsx` (that state now lives in the dialog).

- [ ] **Step 8: Commit**

```bash
git add resources/js/shared/types/index.ts resources/js/modules/contract/api/contractApi.ts resources/js/modules/contract/hooks/use-contracts.ts resources/js/modules/contract/components/contract-cancel-dialog.tsx resources/js/modules/contract/components/contract-detail-drawer.tsx resources/js/lang/en/contract.ts resources/js/lang/th/contract.ts
git commit -m "feat(contract-ui): dedicated cancel dialog with a required reason"
```

---

## Final verification

- [ ] Run `php artisan test --compact --filter=ContractApiTest` — all pass.
- [ ] Ask the user whether to run the full suite and to run the migration on the live DB (per Rollout).

---

## Self-Review

**1. Spec coverage:**
- Require reason on cancel (backend authoritative) → Task 1 Steps 6-7 + tests. ✅
- Store in `cancel_reason` column → Task 1 Steps 3-4. ✅
- Expose in resource → Task 1 Step 5. ✅
- Direction-aware (required on cancel, none on reactivate, cleared on reactivate) → Task 1 Steps 6-7 + `test_reactivate_clears_the_reason_and_needs_none`. ✅
- Whitespace-only rejected → `test_cancel_rejects_a_whitespace_only_reason` (relies on TrimStrings, noted in Global Constraints). ✅
- Expire untouched → not modified in any task; permission test unaffected (abort before validation). ✅
- Dedicated cancel dialog modeled on resign-modal, form-validation UX, asset guard still first → Task 2 Steps 5-6. ✅
- Reactivation stays plain toggle → backend skips validation; no UI reactivate path exists today (documented). ✅
- Frontend types/api/hook + i18n en+th → Task 2 Steps 1-4. ✅
- Tests + existing-test updates → Task 1 Steps 1, 8. ✅

**2. Placeholder scan:** none — every step has full code.

**3. Type consistency:** `toggleCancel(Contract, ?string)` matches the controller call in Task 1; `contractApi.cancel(id, reason?)` matches the hook mutation `{ id, reason? }` and the dialog's `cancel.mutateAsync({ id, reason })`; the `cancel_reason` resource key matches the `Contract` TS field and the test assertions.

**Note:** The dialog's title, label, placeholder, required-error, and failure text all use `t()` keys added to both locales — no hardcoded strings (the lesson carried from the transfer-dialog review).
