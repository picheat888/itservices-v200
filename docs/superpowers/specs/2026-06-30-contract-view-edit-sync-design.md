# Contract View ↔ Edit Sync — Design

**Date:** 2026-06-30
**Module:** Contract & Rental (Module 5)
**Status:** Approved design — pending implementation plan

## Problem

After Variant B (the stepped focus-dialog Edit form) was built, the contract **View** and **Edit** surfaces drifted out of sync in three ways:

1. **Different shells.** View is a right-side `Sheet` drawer (620px); Edit is a centered `Dialog` focus modal (1100px, 6-step wizard). Opening Edit from View jumps from a side drawer to a centre-screen modal — they feel like two different worlds.
2. **Broken open/close flow.** `openEdit()` clears `selectedId` (closing the View) before opening the form. After saving or closing Edit, the user lands back on the **table**, not on the contract they were viewing.
3. **Field/data mismatch.**
   - `notes`: shown in View, but the Edit wizard has **no input** for it (the value is carried in form state and submitted, yet can never be changed) → viewable but not editable.
   - `title`: View shows it only in the sheet header; the detail key/value grid shows `name` but not `title`. Edit requires both.
   - Reminder display differs slightly (View shows a single "reminder threshold" line plus the schedule chips; Edit shows chips only). Cosmetic — left as-is.

## Chosen Approach

**Approach A — unify View into the same focus-dialog family as Edit.**

Both View and Edit become centered `Dialog` surfaces sharing one visual language (header, footer, width). Editing from View keeps the same modal context and returns to View afterward. This resolves all three issues in one move and continues the direction of the `contract-focus-mockup.html` work.

Rejected alternatives:
- **B** (make Edit a right-side drawer like View) — contradicts the just-finished Variant B wizard and cramps a 6-step flow into a narrow drawer.
- **C** (keep both shells, only harmonize fields/flow/tokens) — leaves the core "drawer vs centre-modal" jar in place.

## Design

### 1. Shared chrome

Both surfaces use a centered `Dialog` at **width 1100px** (matching the existing Edit form), so switching View ↔ Edit causes no resize.

A shared header is used by both:
- Type-icon tile (brand-tinted rounded square, icon per `contract.type`)
- Eyebrow label — `สัญญา` / `Contract` (View) vs `แก้ไขสัญญา` / `Edit contract` (Edit)
- Title (contract title/name) + mono code chip (`CT-2026-001`)
- Close (✕) button

The header markup currently lives inline in `ContractFormDrawer`. Extract it into a small shared presentational component (e.g. `ContractDialogHeader`) used by both, so the two surfaces stay visually identical by construction.

Footer bar uses the same border/tone styling on both surfaces.

### 2. View — read-only detail dialog (1100px)

`ContractDetailDrawer` is converted from `Sheet` → `Dialog`. The wider canvas uses a **two-column** read layout so it does not feel empty:

- **Status row** (full width): active / expiring / expired / cancelled badges + "expires in N days" when in reminder window.
- **Left column — particulars:** key/value grid — code, vendor, **title** (newly added), name, type, billing cycle, start, end, value, days remaining, auto-renew, reminder threshold, created/updated, cancelled-on (when cancelled).
- **Right column — related:** notification schedule chips, linked-assets list (with deep links to `/assets?view=`), attachments list (PDF, open in new tab), and **notes** block.

Footer actions (unchanged behavior): **Close · Edit · Cancel contract**. Edit/Cancel hidden when `!canEdit` or already cancelled, exactly as today. The hardware "all assets must be written off" guard on Cancel is preserved.

> Filename stays `contract-detail-drawer.tsx` to avoid churn; it is a dialog despite the legacy "drawer" name.

### 3. Edit — stepped wizard (1100px, unchanged structure)

Keep the existing 6-step Variant B wizard. One functional addition:

- **Notes field**: add a `notes` textarea to the **"Contract details"** step (step 2), bound to the existing `form.notes` state. This closes the view-but-not-edit gap. Notes remain optional; no new validation.

Header/footer already match the shared chrome once extracted.

### 4. Continuous flow

Page-level coordination in `pages/contracts/index.tsx`:

- `openEdit(c)` **no longer clears `selectedId`** — it keeps the viewed contract selected and sets `formOpen = true`.
- On Edit **save success** or **close**: close the form (`setFormOpen(false)`) and keep `selectedId` set so the View re-shows with refreshed data. `useContract(selectedId)` re-reads from React Query, which the contract mutations already invalidate, so the View reflects the edit.
- **Create** flow is unchanged: `openCreate()` opens the form with `editing = null` and no `selectedId`; on success the new row is pinned in the table (existing `handleCreated`). Returning to a View does not apply here because there was no View open.
- **Cancel contract** from View closes everything (existing behavior).

### Interaction detail — avoiding double-dialog overlap

Because View and Edit are now both `Dialog`s, opening Edit while View is open would otherwise stack two modals with two backdrops. **Decision:** the View dialog's `open` is gated to `selected && !formOpen`, while `selectedId` is preserved. So when Edit opens, the View dialog closes (no double backdrop) and the form takes its place at the same 1100px centred position with the same chrome — reading as an in-place mode switch. When the form closes, `formOpen` flips back to `false` and the View dialog reappears with refreshed data. This keeps exactly one modal on screen at any time.

## Out of Scope

- No backend/API changes — all contract fields (incl. `notes`) already exist on the model, resource, and store/update requests.
- No change to the create flow's table-pinning behavior.
- No rename of component files.
- Reminder-threshold vs chips representation difference is left as-is (cosmetic).

## Testing

- **Frontend (manual / existing patterns):** open a contract → View shows title + notes; click Edit → wizard opens at same size; edit notes + a field → Save → returns to View showing updated notes/field; Cancel contract → closes. Repeat for a cancelled contract (Edit/Cancel hidden).
- **Backend (PHPUnit):** existing `ContractApiTest` already covers store/update incl. `notes`. Add/confirm a case asserting `notes` round-trips through update if not already covered. No new endpoints, so no new feature-test files expected beyond that assertion.

## Affected Files

- `resources/js/components/contracts/contract-detail-drawer.tsx` — Sheet → Dialog, two-column 1100px read layout, add `title`.
- `resources/js/components/contracts/contract-form-drawer.tsx` — add `notes` textarea to step 2; use shared header.
- `resources/js/components/contracts/` — new `contract-dialog-header.tsx` (shared chrome) [optional but recommended].
- `resources/js/pages/contracts/index.tsx` — `openEdit`/close coordination to return to View.
- `tests/Feature/ContractApiTest.php` — confirm/assert `notes` update round-trip.
