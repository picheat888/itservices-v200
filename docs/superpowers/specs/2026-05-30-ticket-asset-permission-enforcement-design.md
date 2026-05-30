# Design: make Ticket & Asset permissions enforce for real

**Date:** 2026-05-30
**Status:** Approved (approach A)

## Goal

Make the `tickets.*` and `assets.*` RBAC permissions genuinely control access
end-to-end, and have the Permission matrix reflect them as enforced (drop the
"(Coming soon)" tag).

## Audit findings (current state)

Enforcement already largely exists — this is a gap-closing task, **not** a rewrite.

- **Backend, per-action gating — complete.**
  - Tickets: `TicketController` gates every action (`index` scopes to own unless
    `tickets.view_all`; `summary` requires `view_all`; `store` via
    `StoreTicketRequest::authorize` → `tickets.create`; `take`/`resolve` →
    `tickets.resolve`; `assign` → `tickets.assign`; `destroy` → `tickets.delete`;
    `staff` → `tickets.assign`).
  - Assets: `AssetController` gates reads via `assets.view`; `StoreAssetRequest::authorize`
    gates `assets.register` (POST) / `assets.edit` (PUT); transfer/accept/receive →
    `assets.transfer`; maintenance → `assets.edit`; destroy/to-stock/bulk →
    `assets.retire`.
  - Super Admin bypasses via `User::hasPermission()`.
- **Frontend button gating — present** in `TicketsPage` (`canCreate`, take/assign/
  resolve in the detail drawer) and `AssetsPage` (`canCreate`/`canEdit`/
  `canTransfer`/`canRetire`). Re-verified during implementation.

### The two real gaps

1. **No route-level guard.** `/tickets` and `/assets` render for any authenticated
   user who types the URL. Data is still protected (APIs return 403), but the user
   sees a broken/empty page instead of a clean block.
2. **`LIVE` set is stale.** `resources/js/lib/permission-labels.ts` lists which
   permissions are enforced today; `tickets.*` and `assets.*` are missing, so the
   matrix shows them as "(Coming soon)" even though they are enforced.

## Approach (A — reusable route wrapper)

A single `RequirePermission` wrapper used in `app.tsx`, mirroring the existing
`ProtectedRoute` pattern. Chosen over per-page inline guards (B, scatters logic)
and nav-metadata coupling (C, over-engineered).

## Components

1. **`resources/js/components/auth/require-permission.tsx`** (new)
   - Props: `{ anyOf: string[]; children: React.ReactNode }`.
   - Reads `useAuth()`. Allowed when the user is `super` **or** holds **any** key in
     `anyOf`. Allowed → render `children`. Denied → render an inline `NoAccess` card.
   - `NoAccess`: centered card within the existing `AppShell` (URL unchanged, no
     redirect) — title "You don't have access to this section" + a button back to
     the dashboard.

2. **`resources/js/app.tsx`** — wrap the two module routes:
   - `/tickets` → `anyOf={['tickets.create', 'tickets.view_all']}`
   - `/assets` → `anyOf={['assets.view']}`
   - (Other module routes are out of scope for this task.)

3. **`resources/js/lib/permission-labels.ts`** — add to the `LIVE` set:
   - `tickets.view_all`, `tickets.create`, `tickets.assign`, `tickets.resolve`, `tickets.delete`
   - `assets.view`, `assets.register`, `assets.transfer`, `assets.retire`, `assets.edit`

4. **`resources/js/lib/i18n.ts`** — EN/TH keys for the NoAccess card
   (`noaccess_title`, `noaccess_desc`, `noaccess_back`).

## Data flow

`useAuth().user.permissions` (already returned by the API, super resolved via role)
→ `RequirePermission` decides allow/deny → page or `NoAccess`. No backend changes.

## Why the guard permissions

- Tickets: any employee with `tickets.create` may raise and view their own tickets,
  and IT with `tickets.view_all` sees all — so the page is meaningful with **either**.
- Assets: viewing the inventory is the baseline, gated by `assets.view`.

## Testing

- Backend RBAC is already covered (`TicketApiTest`, `AssetApiTest`) — unchanged.
- Frontend route guard verified via `tsc --noEmit` + `npm run build`; manual check
  that a `user`-role account is blocked from `/assets` and an account with no ticket
  permission is blocked from `/tickets`.

## Out of scope (YAGNI)

- No changes to backend enforcement (already complete).
- No redirect (inline `NoAccess` keeps the URL).
- No other modules (requests/contracts/stock/employees) — only tickets & assets.
- No new permission keys — the catalog already has them.
