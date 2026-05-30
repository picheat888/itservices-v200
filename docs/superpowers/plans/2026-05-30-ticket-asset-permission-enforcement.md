# Ticket & Asset Permission Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a route-level permission guard for `/tickets` and `/assets`, and mark `tickets.*` / `assets.*` as enforced ("LIVE") in the permission matrix.

**Architecture:** Frontend-only change. A reusable `RequirePermission` wrapper (mirroring the existing `ProtectedRoute`) gates the two module routes in `app.tsx`; when denied it renders an inline `NoAccess` card inside the app shell. Backend enforcement already exists and is unchanged. The matrix's `LIVE` set gains the ten ticket/asset keys.

**Tech Stack:** React 19 + TypeScript, react-router-dom, Tailwind, lucide-react. No JS test runner exists in this repo — verification is `npx tsc --noEmit` + `npm run build` + a manual access check.

---

## File Structure

- Create: `resources/js/components/auth/require-permission.tsx` — the guard + `NoAccess` card.
- Modify: `resources/js/app.tsx` — wrap `/tickets` and `/assets` routes.
- Modify: `resources/js/lib/permission-labels.ts` — add ten keys to the `LIVE` set.
- Modify: `resources/js/lib/i18n.ts` — three NoAccess strings in `en` and `th`.

Run all commands from the project root with PowerShell:
`Set-Location C:\xampp\htdocs\itservices-v200; <command>`

---

### Task 1: NoAccess i18n strings

**Files:**
- Modify: `resources/js/lib/i18n.ts`

- [ ] **Step 1: Add the English strings**

In the `en` dict, immediately after the line `    set_sla_note: 'Tickets use these targets to compute SLA met %. The resolution target drives the dashboard SLA figure.',` add:

```ts
    noaccess_title: 'No access',
    noaccess_desc: "You don't have permission to view this section. Contact an administrator if you think this is a mistake.",
    noaccess_back: 'Back to dashboard',
```

- [ ] **Step 2: Add the Thai strings**

In the `th` dict, immediately after the line `    set_sla_note: 'ระบบใช้ค่าเหล่านี้คำนวณ % SLA สำเร็จ โดยเป้า "ปิดเคส" เป็นตัวกำหนดตัวเลข SLA บน dashboard',` add:

```ts
    noaccess_title: 'ไม่มีสิทธิ์เข้าถึง',
    noaccess_desc: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากคิดว่าเป็นข้อผิดพลาดโปรดติดต่อผู้ดูแลระบบ',
    noaccess_back: 'กลับหน้า Dashboard',
```

- [ ] **Step 3: Typecheck**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add resources/js/lib/i18n.ts
git commit -m "i18n(permissions): add NoAccess strings"
```

---

### Task 2: RequirePermission guard component

**Files:**
- Create: `resources/js/components/auth/require-permission.tsx`

- [ ] **Step 1: Create the component**

Write `resources/js/components/auth/require-permission.tsx`:

```tsx
import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Gates a route's content. The user passes when they are the super admin or hold
 * at least one of the `anyOf` permission keys; otherwise an inline NoAccess card
 * is shown (the URL is left unchanged — no redirect).
 */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
    const { user } = useAuth();
    const allowed = user?.role === 'super' || anyOf.some((p) => user?.permissions?.includes(p));

    if (allowed) {
        return <>{children}</>;
    }

    return <NoAccess />;
}

/** Friendly "you can't see this" panel rendered inside the app shell. */
function NoAccess() {
    const t = useT();
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <span className="bg-destructive/10 text-destructive flex h-14 w-14 items-center justify-center rounded-full">
                <ShieldAlert className="h-7 w-7" />
            </span>
            <h1 className="text-xl font-bold">{t('noaccess_title')}</h1>
            <p className="text-muted-foreground max-w-sm text-sm">{t('noaccess_desc')}</p>
            <Link to="/" className="bg-brand mt-2 rounded-md px-4 py-2 text-sm font-medium text-white">
                {t('noaccess_back')}
            </Link>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean). The component is unused until Task 3, but it must compile.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/auth/require-permission.tsx
git commit -m "feat(permissions): add RequirePermission route guard"
```

---

### Task 3: Wrap the /tickets and /assets routes

**Files:**
- Modify: `resources/js/app.tsx`

- [ ] **Step 1: Import the guard**

After the line `import { AppShell } from '@/components/shell/app-shell';` add:

```ts
import { RequirePermission } from '@/components/auth/require-permission';
```

- [ ] **Step 2: Wrap the two routes**

Replace these two lines:

```tsx
                        <Route path="tickets" element={<TicketsPage />} />
                        <Route path="assets" element={<AssetsPage />} />
```

with:

```tsx
                        <Route
                            path="tickets"
                            element={
                                <RequirePermission anyOf={['tickets.create', 'tickets.view_all']}>
                                    <TicketsPage />
                                </RequirePermission>
                            }
                        />
                        <Route
                            path="assets"
                            element={
                                <RequirePermission anyOf={['assets.view']}>
                                    <AssetsPage />
                                </RequirePermission>
                            }
                        />
```

- [ ] **Step 3: Typecheck**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add resources/js/app.tsx
git commit -m "feat(permissions): guard /tickets and /assets routes by permission"
```

---

### Task 4: Mark ticket/asset permissions LIVE

**Files:**
- Modify: `resources/js/lib/permission-labels.ts`

- [ ] **Step 1: Add the ten keys to the LIVE set**

In the `const LIVE = new Set<string>([` array, add these entries at the top (just after the opening `[`):

```ts
    'tickets.view_all',
    'tickets.create',
    'tickets.assign',
    'tickets.resolve',
    'tickets.delete',
    'assets.view',
    'assets.register',
    'assets.transfer',
    'assets.retire',
    'assets.edit',
```

- [ ] **Step 2: Typecheck**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx tsc --noEmit -p tsconfig.json`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add resources/js/lib/permission-labels.ts
git commit -m "feat(permissions): mark tickets.* and assets.* as enforced (LIVE)"
```

---

### Task 5: Verify button gating, build, and manual access check

**Files:**
- Read-only verification of `resources/js/pages/tickets/index.tsx` and `resources/js/pages/assets/index.tsx`.

- [ ] **Step 1: Confirm in-page actions are permission-gated**

Open `resources/js/pages/tickets/index.tsx` and `resources/js/pages/assets/index.tsx`. Confirm every mutating action is behind a permission check:
- Tickets: the "New ticket" button is behind `canCreate`; take/assign/resolve live in the detail drawer which receives `isIT`/`isSuper`/`meId`.
- Assets: register/edit/transfer/retire/maintenance/bulk are behind `canCreate`/`canEdit`/`canTransfer`/`canRetire`.

If any mutating button is NOT gated, wrap it in the matching `perms.includes('<key>')` check (super already passes because its permissions list is complete). If everything is already gated, make no change.

- [ ] **Step 2: Format any changed files**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npx prettier --write "resources/js/components/auth/require-permission.tsx" "resources/js/app.tsx" "resources/js/lib/permission-labels.ts" "resources/js/lib/i18n.ts"`
Expected: files listed as formatted/unchanged.

- [ ] **Step 3: Build the frontend**

Run: `Set-Location C:\xampp\htdocs\itservices-v200; npm run build`
Expected: `✓ built` with a written `public/build/manifest.json` (the chunk-size warning is normal).

- [ ] **Step 4: Manual access check**

With the app running, log in as the demo `user` account (Staff role) and visit `/assets` directly — expect the NoAccess card (no inventory). Visit `/tickets` — expect the page (the Staff role has `tickets.create`). Log in as `it` (admin) and confirm both pages load. In Settings → … → Permissions matrix, confirm ticket and asset rows no longer show "(Coming soon)".

- [ ] **Step 5: Commit any gating fixes**

If Step 1 changed a page file:

```bash
git add resources/js/pages/tickets/index.tsx resources/js/pages/assets/index.tsx
git commit -m "fix(permissions): gate remaining ticket/asset action buttons"
```

If no page change was needed, skip this commit.

---

## Self-Review

- **Spec coverage:** route guard (Tasks 2–3) ✓; LIVE set (Task 4) ✓; NoAccess i18n (Task 1) ✓; button-gating verification (Task 5) ✓; no backend changes ✓; no redirect (inline NoAccess) ✓; only tickets & assets ✓.
- **Placeholder scan:** none — every step has exact code/commands.
- **Type consistency:** `RequirePermission({ anyOf, children })` is defined in Task 2 and called identically in Task 3; `user.role` / `user.permissions` match the `User` type used by `useAuth`.
