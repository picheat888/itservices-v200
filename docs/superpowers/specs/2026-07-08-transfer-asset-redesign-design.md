# Transfer Asset Redesign — Design Spec

**Date:** 2026-07-08
**Status:** approved (design), pending spec review

## Problem

Transferring an asset to a new owner requires typing the Employee ID by hand
(`asset-transfer-drawer.tsx`, a right-side Sheet). Typos produce wrong/broken
owners. `assets.owner` is a free-text string mixing employee codes (`EMP-1901`)
with non-person labels (`Shared — HR`, `Rack 2`), so the system cannot reliably
answer "is this asset held by an employee right now?" — which is exactly what the
write-off lifecycle needs.

## Goals

1. **Transfer UI** — a centered focus Dialog (replacing the Sheet) with two modes:
   pick an **Employee** from a searchable list (no typing IDs), or assign to
   **Shared/common use (ของกลาง)** by Location + a short label.
2. **Owner model** — add `assets.owner_employee_id` (FK → employees) so "held by an
   employee" is a reliable fact, not a string guess.
3. **Write-off guard** — an asset may be written off only when no employee holds it.

Non-goals: changing the contract cancel/end rule (already requires all linked assets
to be `writeoff` — `ContractService::assertCancellable`); reworking `initial_owner`
or the `asset_transfers` history (both stay free-text snapshots, per the
current-vs-log principle).

## Data model

**Migration** `add_owner_employee_id_to_assets`:
- Add `owner_employee_id` — nullable `foreignId` → `employees(id)`, `nullOnDelete`, after `owner`.
- Keep `owner` (string, nullable) as a **display label**:
  - Employee mode → the employee's `code` (keeps search + `initial_owner` + transfer-log snapshots working).
  - Shared mode → the shared label (e.g. `Rack 2`, `เครื่องพิมพ์ส่วนกลาง HR`).
  - Pool/Ready → `null`.
- **Backfill** in the same migration: for each asset whose `owner` matches an
  `employees.code`, set `owner_employee_id` to that employee's id. Non-matching
  owners (shared labels) keep `owner` as-is with `owner_employee_id = null`.
- `down()`: drop the FK column (the `owner` string already carries the label).

**Model** `App\Models\Asset\Asset`:
- `ownerEmployee(): BelongsTo` → `App\Models\Employee\Employee` on `owner_employee_id`.
  (Named `ownerEmployee`, not `owner`, because the `owner` string column would
  shadow an `owner()` relation.)
- Add `owner_employee_id` to `$fillable`.
- Helper `heldByEmployee(): bool` → `$this->owner_employee_id !== null`.

## Transfer flow (2 modes)

`AssetController::transfer` request validation (mutually-exclusive modes):
- `mode` — `required`, `in:employee,shared`.
- Employee mode: `owner_employee_id` `required|integer|exists:employees,id`; `location_id` `required|integer|exists:locations,id`.
- Shared mode: `owner_label` `required|string|max:200`; `location_id` `required|integer|exists:locations,id`.
- `reason` `nullable|string|max:500` (both).

`AssetService::transfer(Asset $asset, array $data, ?string $performedBy)`:
- Guard (unchanged): `abort_if($asset->isDeployed(), 422, 'return it first')`.
- **Employee mode:** `owner_employee_id = id`, `owner = employee.code`,
  `status = PendingAcceptance`, `location_id`. Log transfer (from = old owner label
  or warehouse). Notify the recipient (resolve email via the Employee).
- **Shared mode:** `owner_employee_id = null`, `owner = owner_label`,
  `status = Deployed` (no person to accept), `location_id`. Log transfer. No notify.

`from` label for the transfer-log snapshot = `$asset->owner ?: $asset->warehouse?->name`
(unchanged behaviour).

## Consumers switched to the FK (reliability)

- **`AssetController::mine` (my-assets):** `where('owner_employee_id', $employee->id)`
  instead of `where('owner', $code)`.
- **`accept` / `requestReturn` authorization:** compare
  `$asset->owner_employee_id === $request->user()?->linkedEmployee()?->id`
  instead of `$code === $asset->owner`.
- **`AssetService::notifyRecipient`:** resolve the recipient through
  `$asset->ownerEmployee` (its linked user's email) instead of looking the employee
  up by the owner code string.
- **Search** (`orWhere('owner','like')`) stays — `owner` still holds the code/label.
- **Eager-load** `ownerEmployee` on the list / show / mine / summary queries.

## Write-off guard

`AssetService::writeOff` (single) and `bulkSetStatus(..., Writeoff)`:
- Reject any asset with `owner_employee_id !== null` →
  `422` "Return it from the employee before writing it off."
- Allowed when `owner_employee_id IS NULL` (Ready / pool / shared / already returned).
- Bulk: if any selected id is still employee-held, abort the whole batch with the
  offending tags listed (no partial write-off).

This composes with the existing contract rule: to end/cancel a hardware contract,
every linked asset must be `writeoff`; employee-held ones must be returned first,
shared ones can be written off directly.

## Resource

`AssetResource` adds:
- `owner_employee_id` (int|null),
- `owner_name` — display name of the holder: `ownerEmployee?->display name` in
  employee mode, else the `owner` label (shared), else null.
- `owner` (existing) stays for back-compat.

## UI — `asset-transfer-drawer.tsx` → centered Dialog

- Replace `Sheet` with the shared `Dialog`/`DialogContent` (centered, `max-w`, same
  visual tone as `asset-form-drawer`). Rename file/component to
  `asset-transfer-dialog.tsx` / `AssetTransferDialog`; update the barrel + callers.
- Header: title + `{tag} — {model}`, current-owner read-only line.
- **Segmented toggle**: พนักงาน (Employee) | ของกลาง (Shared).
- Employee mode: `SearchableSelect` sourced from `useEmployees()` — option label
  `"{name} · {code} · {department}"`, `value = String(employee.id)`, searchable by
  name/code. Plus Location select + reason.
- Shared mode: Location select + `Input` for the shared label + reason.
- Validation: employee mode requires a picked employee + location; shared requires
  label + location. Submit posts `{mode, owner_employee_id|owner_label, location_id, reason?}`.
- Save button lifecycle (spinner → close), reuse the existing form-validation UX
  standard.
- i18n: add keys to `lang/<locale>/asset.ts` (`transfer_mode_employee`,
  `transfer_mode_shared`, `transfer_shared_label`, …); no hardcoded strings.

Frontend types/api:
- `Asset` gains `owner_employee_id: number | null`, `owner_name: string | null`.
- `assetApi.transfer` payload becomes
  `{ mode: 'employee'|'shared', owner_employee_id?: number, owner_label?: string, location_id: number, reason?: string }`;
  hook `transfer` mutation updated accordingly.

## Tests (`tests/Feature/AssetApiTest.php`)

- Transfer (employee mode): posts `owner_employee_id` → `pending_acceptance`,
  `data.owner_employee_id` set, recipient notified.
- Transfer (shared mode): posts `owner_label` + `location_id` → `deployed`,
  `owner_employee_id` null, `data.owner` = label, no notification.
- Transfer validation: employee mode without `owner_employee_id` → 422; shared mode
  without `owner_label` → 422.
- `accept` / `requestReturn`: authorized by `owner_employee_id` (the linked employee),
  403 for a different user.
- my-assets: returns assets where `owner_employee_id` = caller's employee.
- **Write-off blocked** while employee-held (single + bulk) → 422; allowed for
  Ready / shared (`owner_employee_id` null).
- Migration backfill: an asset seeded with `owner = 'EMP-xxxx'` gets
  `owner_employee_id` set to the matching employee after migrate.

## Rollout

Run the migration on the live DB after review (backfills owner_employee_id from the
existing owner strings). Frontend `npm run build`; backend `php artisan test`.

## Self-review notes

- Placeholder scan: none.
- Consistency: write-off rule keys off `owner_employee_id IS NULL`, which the
  transfer flow sets/clears and `markReceived` (return to pool) clears — verify
  `markReceived` sets `owner_employee_id = null` too (add to that method).
- Ambiguity: "shared label" stored in the existing `owner` column (no new column),
  per approved design.
