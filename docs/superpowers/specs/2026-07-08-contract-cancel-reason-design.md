# Contract Cancel Reason — Design Spec

**Date:** 2026-07-08
**Status:** approved (design)

## Problem

Cancelling a contract records only a `cancelled_at` timestamp — there is no
record of *why* it was cancelled. Cancellation is a reversible, admin-driven
action with real consequences (it stops expiry alerts and sinks the contract
in listings), so the reason should be captured and required at the moment of
cancellation, and validated.

## Goals

1. **Require a reason** when an active contract is cancelled — enforced on the
   backend (authoritative) and mirrored in the UI for feedback.
2. **Store the reason** in a dedicated `contracts.cancel_reason` column, shown
   in the detail drawer and the audit log.

Non-goals: the **Expire** action is unchanged (no reason required — per owner
decision, Cancel only). Reactivation stays a plain toggle. The existing
"all linked assets must be written off first" close-out guard is unchanged.

## Data model

**Migration** `add_cancel_reason_to_contracts`:
- Add `cancel_reason` — nullable `text`, after `expired_at`.
- `down()`: drop the column.
- No backfill: existing cancelled contracts keep a null reason (historical
  cancellations pre-date this feature).

**Model** `App\Models\Contract\Contract`:
- Add `cancel_reason` to `$fillable`.

## Cancel flow (direction-aware)

The cancel endpoint (`POST /contracts/{contract}/cancel`) is a **toggle**:
it cancels an active contract or reactivates a cancelled one. The reason is
required only in the cancelling direction.

`ContractController::cancel`:
- Keep the `contracts.cancel` permission gate.
- **Cancelling** (`$contract->cancelled_at === null`): validate
  `reason` → `required|string|max:500` (`422 {errors:{reason}}` on failure).
- **Reactivating** (`$contract->cancelled_at !== null`): do **not** validate a
  reason (none is sent).
- Pass the validated reason (or null when reactivating) to the service.
- Audit log: the "Cancelled contract" entry includes the reason; the
  "Reactivated contract" entry is unchanged.

`ContractService::toggleCancel(Contract $contract, ?string $reason = null)`:
- Keep the existing `assertNoPendingAssets($contract)` guard on the
  active → cancelled transition (unchanged).
- **Cancel:** set `cancelled_at = now()`, `cancel_reason = $reason`.
- **Reactivate:** set `cancelled_at = null`, `cancel_reason = null` (so a later
  re-cancel always captures a fresh reason).

Validation rule rationale: `max:500` matches the other free-text reason fields
in the app (`assets.last_reason`, `employees.resign_reason`). "Required" means a
trimmed, non-empty string — an all-whitespace reason is rejected.

## Resource

`ContractResource` adds:
- `cancel_reason` (string|null).

## UI — dedicated cancel dialog

New `resources/js/modules/contract/components/contract-cancel-dialog.tsx`
(`ContractCancelDialog`), modeled on the existing `resign-modal.tsx`:
- Replaces the current `useConfirm()` danger-confirm cancel path in
  `contract-detail-drawer.tsx`. The existing **asset guard** (`assertAssetsClear`
  → the "cannot close yet" notice when linked assets aren't all written off)
  still runs first; only if clear does this dialog open.
- Shows the contract name + code, a required reason `textarea`, and Cancel /
  Confirm buttons. Uses the project form-validation UX standard: red border +
  red helper text on the empty field, submit-button loading state, and it
  surfaces a server `422` on `reason`.
- On confirm: `cancel.mutateAsync({ id, reason })`, then close the drawer
  (same post-cancel behavior as today).
- **Reactivation is unchanged** — it stays the plain toggle (calls cancel with
  no reason; the backend skips reason validation in that direction).
- i18n: new keys in `lang/en/contract.ts` + `lang/th/contract.ts`
  (`contract_cancel_reason`, `contract_cancel_reason_ph`,
  `contract_cancel_reason_required`, dialog title/confirm as needed). No
  hardcoded strings.

Frontend types/api:
- `Contract` gains `cancel_reason: string | null`.
- `contractApi.cancel` becomes `cancel(id: number, reason: string)`; the
  reactivate call site omits the reason (`reason` optional on the client type,
  required by the server only when cancelling).
- `useContractMutations().cancel` mutation input becomes `{ id, reason? }`.

## Tests (`tests/Feature/ContractApiTest.php`)

- **Cancel without a reason → 422** on `reason`; the contract stays active
  (`cancelled_at` null).
- **Cancel with a reason** → `cancelled_at` set, `cancel_reason` stored,
  resource returns `data.cancel_reason`.
- **Whitespace-only reason → 422** (required means non-empty).
- **Reactivate** (already-cancelled contract, no reason) → succeeds,
  `cancelled_at` null, `cancel_reason` cleared to null.
- **Expire still works** with no reason (unchanged).
- Existing cancel tests updated to send a reason.

Frontend: `npm run build` green (no frontend unit tests in this project).

## Rollout

Additive migration (`down()` drops the column, clean rollback). Run on the
live DB after review; `npm run build`; `php artisan test`.

## Self-review notes

- Placeholder scan: none.
- Consistency: validation is direction-aware — required on cancel, absent on
  reactivate — matching the toggle endpoint. `cancel_reason` is cleared on
  reactivate so it never shows a stale reason for a re-activated contract.
- Ambiguity: "reason required" = trimmed non-empty, `max:500`, made explicit.
