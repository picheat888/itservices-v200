# Contract View Details — Tabbed Redesign — Design

**Date:** 2026-06-30
**Module:** Contract & Rental (Module 5)
**Status:** Approved design (via interactive mockup) — pending implementation plan
**Mockup:** `docs/mockup/contract-view-tabs-mockup.html`
**Builds on:** `2026-06-30-contract-view-edit-sync-design.md` (the View is now a centered 1100px focus dialog)

## Problem / Goal

The contract View Details dialog currently shows everything in one long two-column scroll. Reframe it as a **tabbed** dialog so each concern has its own space, and surface the most important signals (status, days-remaining) in the header:

1. Move the **status badge** (Active / Expired / Cancelled) to the header top-right, beside the ✕ close button.
2. Move the **days-remaining badge** ("Expires in N days") inline next to the contract-code chip in the title.
3. Split the body into three tabs: **Overview**, **Assets**, **Attachments**.
4. **Assets** tab = a data table of linked assets; clicking a row opens the asset's detail. The table **fills the dialog and paginates** (no inner scroll, no rows-per-page picker).
5. **Attachments** tab = file list + an in-dialog **PDF preview** that fills the frame; long file names truncate in the middle.
6. Drop the redundant footer **Close** button (the ✕ already closes).

No backend changes — all data already exists on the contract and asset endpoints.

## Design

### 1. Shared header changes (`ContractDialogHeader`)

Add two optional slots so the View can enrich the shared header without affecting the Edit wizard (which passes neither):

- `titleSuffix?: React.ReactNode` — rendered inside the title row, **after** the code chip. The View passes the **days-remaining badge**.
- `headerRight?: React.ReactNode` — rendered at the header's right edge, left of the ✕ (with right padding to clear it). The View passes the **status badge**.

**Days-remaining badge** (built in the View, passed as `titleSuffix`): a compact pill with a clock icon.
- Cancelled → not shown (status badge already says Cancelled).
- `days_remaining <= 0` → red, "เกินกำหนด N วัน" / "N days overdue".
- `in_reminder` → amber, "หมดอายุใน N วัน" / "Expires in N days".
- otherwise → blue/neutral, "เหลือ N วัน" / "N days left".

**Status badge** (passed as `headerRight`): reuse the existing tone/label logic already in the detail component (green Active / red Expired / gray Cancelled).

### 2. Tab bar

A lightweight custom tab bar inside the dialog (same visual pattern as the Contracts page tabs — underline on active), below the header and above the body:

`Overview` · `Assets <count>` · `Attachments <count>`

- Counts come from `linked_assets.length` and `attachments.length`; the count chip is hidden when zero.
- Tab state is **transient** — opens on **Overview** every time, no URL/localStorage persistence (it is a short-lived modal).
- Only the active tab's panel mounts/renders its body; the dialog height stays fixed and only the panel area scrolls (except Assets, which paginates instead — see below).

### 3. Overview tab

Two-column read layout (the existing particulars, minus assets/attachments which now have their own tabs, minus the reminder badge which moved to the header):

- **Left — particulars grid:** code, vendor, title, name, type, billing cycle, start, end, value, days remaining, auto-renew, reminder threshold, created, updated, cancelled-on (when cancelled).
- **Right:** notification schedule chips + notes block (`whitespace-pre-wrap`).

### 4. Assets tab — data table (fill mode)

Reuse the shared `DataTable` (`@/components/shared/data-table.tsx`) in a new **fill-height** mode:

- Columns: **Tag** (mono) · **Name** · **Type** · **Serial** (mono) · **Owner** · **Status** (badge).
- `searchable` over tag / name / serial.
- **New `fillHeight` prop on DataTable** (opt-in; default keeps current behavior): the table body grows to fill its container, the number of rows shown is computed from the available height, the rows-per-page picker is hidden, and only Prev/Next + a range label remain. No inner scroll — when rows overflow, you page over. Recomputes on container resize.
- **Row click → open `AssetDetailDrawer` nested** on top of the dialog. The contract only carries a subset of asset fields, so on click fetch the full asset by id via `assetApi.get(id)` and render `AssetDetailDrawer` read-only: `canTransfer={false}` (transfer/receive buttons are already gated by `canTransfer`, so only Close shows), `onTransfer`/`onReceive` as no-ops, `onClose` clears the selection. A brief load before the drawer appears is acceptable.
- Empty state when the contract has no linked assets.

### 5. Attachments tab — list + in-dialog PDF preview

Two columns inside the panel (fixed height filling the body):

- **Left — file list** (own vertical scroll; contracts cap attachments at 5 via the form's `MAX_FILES = 5`, so it stays short): each row shows a PDF icon, the file name (middle-truncated), and the size. Selected row highlighted. Defaults to the first file selected.
- **Right — preview:** an `<iframe src={attachment.url}>` filling the frame (100% width/height) with a top bar showing the file name + **Open in new tab** and **Download** buttons.
- **Long file names:** middle-truncation — keep the start and the tail (including `.pdf`) with an ellipsis in the middle, via a two-span flexbox (`.fn-a` ellipsis + `.fn-b` fixed tail); full name on hover (`title`). Applied in both the list and the preview bar.
- Empty state when there are no attachments.

### 6. Footer

- Remove the **Close** button (the header ✕ / overlay click / Esc already close the dialog).
- Layout: **Cancel contract** (destructive) pinned left (`margin-right:auto`); **Edit** pinned right.
- Smaller buttons (~34px tall, compact padding) — not full-width-stretched.
- Edit/Cancel remain gated by `canEdit && !cancelled`; the hardware "all linked assets written off" guard on Cancel is preserved.

## Component / File Plan

- `resources/js/components/contracts/contract-dialog-header.tsx` — add `titleSuffix` + `headerRight` optional props.
- `resources/js/components/shared/data-table.tsx` — add opt-in `fillHeight` prop.
- `resources/js/components/contracts/contract-detail-drawer.tsx` — shell + tab bar + Overview panel + header wiring (status badge, days-remaining badge) + footer; delegates Assets/Attachments to the two new components.
- `resources/js/components/contracts/contract-assets-tab.tsx` — DataTable (fillHeight) + nested AssetDetailDrawer + `assetApi.get` fetch.
- `resources/js/components/contracts/contract-attachments-tab.tsx` — file list (middle-truncation) + PDF preview iframe.

## Out of Scope

- No backend / API / DB changes (contract + asset endpoints already return everything needed; `assetApi.get` already exists).
- No tab-state persistence (modal opens on Overview each time).
- No change to the Edit wizard (only `ContractDialogHeader` gains optional props it already ignores).
- Other tables that use `DataTable` are untouched — `fillHeight` is opt-in and defaults off.

## Testing

- **Frontend (no test runner in this project):** verify with `npx tsc --noEmit` and manual checks:
  - Header: status badge top-right by ✕; days-remaining badge next to the code chip, colored by state.
  - Tabs switch; counts correct; opens on Overview.
  - Assets: table fills the dialog and pages with Prev/Next (no inner scroll, no rows-per-page picker); resizing recomputes rows; row click opens the asset detail drawer (read-only, Close only); empty state with no assets.
  - Attachments: long names middle-truncate with tooltip; clicking a file swaps the preview; preview fills the frame; open-in-new-tab/download present; empty state with no files.
  - Footer: no Close button; Cancel left, Edit right; both hidden for a cancelled contract.
- **DataTable `fillHeight` regression:** confirm an existing table that does NOT pass `fillHeight` (e.g. the contracts list or a stock table) renders unchanged.
- **Backend:** none (no PHPUnit changes expected).
