# Asset View Details — Focus Dialog with Tabs — Design

**Date:** 2026-07-02
**Module:** Assets Management (Module 4)
**Status:** Approved design (via interactive mockup) — pending implementation plan
**Mockup:** `docs/mockup/asset-view-tabs-mockup.html`
**Pattern source:** the Stock (`2026-06-30-stock-view-details-tabs-design.md`) and Contract (`2026-06-30-contract-view-details-tabs-design.md`) tabbed View Details — same focus-dialog + tabs + `fillHeight` DataTable approach.

## Problem / Goal

`AssetDetailDrawer` (`resources/js/modules/asset/components/asset-detail-drawer.tsx`) is a 560px right-side `Sheet` — a single long scroll of General / Ownership / Acquisition / Notes / Last-reason sections. Reframe it as a **centered 1100px tabbed focus dialog** matching Stock and Contract, splitting concerns into tabs and surfacing key signals in the header. Two new tabs give the asset a lifecycle view it currently lacks:

1. **งานแจ้งซ่อม (Repair tickets)** — tickets that reference this asset (`tickets.related_asset_id`).
2. **History (custody trail)** — ownership transfers + returns-to-pool (`asset_transfers`).

## Design

### Shell & header

- Centered `Dialog` at **`max-w-[1100px]`**, fixed height `h-[min(860px,calc(100vh-72px))]`, flex column (header / tabs / body / footer) — same shape as Stock/Contract.
- Retain the last asset in state (`shown`) so content stays rendered during the close fade-out (no skeleton flash), mirroring `ContractDetailDrawer`.
- **Header (built inline** — not the contract-specific `ContractDialogHeader`): `AssetTypeIcon` tile + eyebrow "ทรัพย์สิน / Asset" + asset **model** name + **mono tag chip** + a **type pill** + a **source pill** (owned/rented) + the **`AssetStatusBadge`** pinned top-right beside the ✕.

### Data loading

- The dialog receives the `asset` prop (a full `AssetResource` from the list — every Overview field is already present, incl. `contract_code` since the list query eager-loads `contract`).
- It additionally calls a new **`useAsset(asset?.id)`** hook that fetches the **enriched** asset (`GET /assets/{id}`, now including `transfers` + `tickets`). Overview renders immediately from the passed `asset`; the Tickets/History tabs render from the fetched data (with a small loading state until it arrives).
- Enabled only while a detail is open.

### Tabs

Custom tab bar (same visual pattern as Contract/Stock): `Overview · งานแจ้งซ่อม <count> · History <count>`.
- Counts: tickets count = `asset.tickets.length`; history count = `asset.transfers.length` (from the enriched fetch; chip hidden until loaded / when 0).
- Opens on **Overview** each time (reset on asset change); transient (no persistence).
- Only the active panel renders. Overview scrolls; Tickets and History use **fill mode** (paginate, no inner scroll).

### Tab: Overview

- **KPI strip (3 cells):** Value (`value_display`, "/mo" already baked in for rented) · Warranty/Coverage (`cover_end` with a days-remaining sub-line, colored amber when near/overdue) · Current holder (`owner`, with a sub-line for pool/return state).
- **Meta grids** (reuse the existing sections): General (type, brand, serial, location) · Ownership (owner, initial_owner, department, registered_date) · Acquisition (value + purchase/warranty for owned, or contract/lease dates for rented, + supplier).
- **Notes** and **Last reason** blocks (shown when present; last-reason keeps its amber treatment).
- **Linked-contract card** on the right rail — shown only when `source === 'rented'`: contract code + vendor + type + start/end + value, and an **"เปิดสัญญา / Open contract"** link (navigates to the contract, e.g. `/contracts?view={contract_id}`).

### Tab: งานแจ้งซ่อม (Repair tickets)

- Data source: `asset.tickets[]` (from the enriched fetch). Render with the shared `DataTable` in **`fillHeight`** mode (Prev/Next, no rows-per-page picker, no inner scroll).
- Columns: **เรื่อง** (ticket_no small + subject/subject_th) · **หมวดหมู่** (category) · **ความสำคัญ** (priority badge — critical=red / high=amber / medium=blue / low=gray) · **สถานะ** (status badge — open=amber / in_progress=blue / completed=green / canceled=gray) · **วันที่แจ้ง** (`created_at`) · **ผู้รับผิดชอบ** (`assignee_name`).
- **Row click → navigate to the ticket** (deep-link into the Tickets module, e.g. `/tickets?view={id}`). Read-only from the asset's perspective.
- Empty state when the asset has no repair tickets; loading state while the enriched fetch is in flight.

### Tab: History (custody trail)

- Data source: `asset.transfers[]` (ownership transfers + returns-to-pool; already recorded by `AssetService::logTransfer`). `DataTable` in **`fillHeight`** mode.
- Columns: **วันที่** (`date`) · **จาก → ถึง** (`from_owner → to_owner`; "Pool — IT" endpoints highlighted) · **เหตุผล** (`reason`) · **โดย** (`performed_by`).
- Empty state when the asset has no transfer history.

### Footer

- The header ✕ / overlay / Esc handle closing (no separate Close button), matching Contract.
- **Right — context action** (gated by `canTransfer`, preserving current behavior): `ยืนยันรับคืน / Mark received` when `status === 'pending_return'`, otherwise `โอนย้าย / Transfer` when not blocked (`deployed`/`writeoff`/`pending_stock` are blocked).
- **Left — Edit** (gated by `canEdit`): opens the existing `AssetFormDrawer` via a new `onEdit?` callback; the page closes the detail and opens the edit form.
- Maintenance-toggle and To-stock remain **row/toolbar actions** (out of scope for the footer to keep it clean).
- Buttons ~34px, matching Stock/Contract.

## Component / File Plan

**Backend**
- `app/Models/Asset/Asset.php` — add `transfers(): HasMany` (`AssetTransfer`, `latest()`) and `tickets(): HasMany` (`Ticket` on `related_asset_id`, `latest()`).
- `app/Http/Controllers/Api/Asset/AssetController.php` — `show()` loads `['contract', 'transfers', 'tickets.assignee']`.
- `app/Http/Resources/Asset/AssetResource.php` — add `transfers` (whenLoaded, mapped like the existing `transfers()` endpoint: id/date/from_owner/to_owner/reason/performed_by) and `tickets` (whenLoaded, compact: id/ticket_no/subject/subject_th/category/priority/status/assignee_name/created_at/resolved_at). Both `whenLoaded` so the list endpoint stays lean.

**Frontend**
- `resources/js/shared/types/index.ts` — add `transfers?: AssetTransferLog[]` and `tickets?: AssetTicket[]` to `Asset`; define `AssetTicket` (id, ticket_no, subject, subject_th, category, priority, status, assignee_name, created_at, resolved_at).
- `resources/js/modules/asset/hooks/use-assets.ts` — add `useAsset(id)` (react-query `['asset', id]` → `assetApi.get`).
- `resources/js/modules/asset/components/asset-detail-drawer.tsx` — rewrite: 1100px tabbed focus dialog + inline header + Overview panel + footer; `useAsset` for enriched data; add optional `onEdit?: (a: Asset) => void`; retain-last-asset for close animation.
- `resources/js/modules/asset/components/asset-tickets-tab.tsx` — new: `DataTable` (fillHeight) of `asset.tickets` with category/priority/status badges; row click navigates to the ticket.
- `resources/js/modules/asset/components/asset-history-tab.tsx` — new: `DataTable` (fillHeight) of `asset.transfers`.
- `resources/js/modules/asset/pages/index.tsx` — pass `onEdit={canEdit ? openEdit : undefined}` to `AssetDetailDrawer`.
- `resources/js/lang/en/asset.ts` + `resources/js/lang/th/asset.ts` — add tab labels + ticket/history column keys + empty-state strings.
- `resources/js/modules/ticket/pages/index.tsx` — add minimal `?view=<id>` deep-link support (fetch by id via `ticketApi.get`, open the detail drawer, clear the param) so an asset's repair-ticket row can open the ticket. Mirrors the existing asset/contract `?view=` handlers.

**Cross-module note:** `asset-tickets-tab` inlines the ticket status/priority tones + reuses the global `ticket_*` i18n keys rather than importing `@/modules/ticket` — the ticket module already imports `@/modules/asset` (`take-case-modal` → `useAssets`), so a barrel import back would close an asset ⇄ ticket dependency cycle. Same approach `contract-assets-tab` uses for asset status.

## Out of Scope

- No DB / migration changes (`tickets.related_asset_id` and `asset_transfers` already exist).
- No change to the add/edit `AssetFormDrawer`, `AssetTransferDrawer`, or `AssetToStockModal`.
- The only Tickets-module change is the `?view=` deep-link handler above (no change to ticket data, detail drawer, or actions).
- The global `/assets/transfers` endpoint stays as-is.
- `DataTable` is unchanged (the `fillHeight` prop already exists from the Contract feature).
- No tab-state persistence (modal opens on Overview each time).

## Testing

- **Backend (PHPUnit):** a feature test that `GET /assets/{id}` returns `transfers` and `tickets` for an asset that has related `AssetTransfer` rows and `Ticket`s (via factories); and that the assets **list** endpoint does **not** include those keys (whenLoaded gating). Assert the ticket compact shape (ticket_no, priority, status, assignee_name).
- **Frontend (no test runner):** `npx tsc --noEmit` clean for touched files, plus manual checks:
  - Header: status badge top-right by ✕; type + source pills; 1100px dialog; close fades out (no skeleton flash).
  - Tabs: open on Overview; ticket/history counts correct (appear after enriched fetch); count chip hidden when 0.
  - Overview: KPI strip + meta grids render from the list asset; contract card + "open contract" link shown only for rented; notes/last-reason when present.
  - Tickets: table fills the panel and pages with Prev/Next (no inner scroll, no picker); priority/status badges colored; row click navigates to the ticket; empty + loading states.
  - History: table fills + pages; Pool endpoints highlighted; empty state.
  - Footer: context action = Mark received (pending_return) / Transfer (otherwise), gated by `canTransfer`; Edit shown only with `canEdit`, closes the detail and opens the edit form.
- **Pint:** run `vendor/bin/pint --dirty` after backend edits.
