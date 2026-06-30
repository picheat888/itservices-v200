# Contract View ↔ Edit Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the contract View and Edit surfaces feel like one coherent focus-dialog: same centered 1100px shell, a notes field on Edit, and a continuous View → Edit → back-to-View flow.

**Architecture:** Convert the View detail from a right-side `Sheet` into a centered `Dialog` matching the existing Edit wizard. Extract the shared header into one component used by both. Coordinate open/close at the page level so editing returns to the View with refreshed data. No backend changes — every field (incl. `notes`) already round-trips through the existing store/update endpoints.

**Tech Stack:** React 19 + TypeScript, Radix Dialog (`@/components/ui/dialog`), Tailwind v4, TanStack Query, Laravel 12 + PHPUnit (backend test only).

## Global Constraints

- No inline styles — Tailwind classes only.
- TypeScript everywhere; components in PascalCase.
- Comment every function you create (project rule).
- Do not change dependencies.
- This project has **no frontend test runner** — frontend tasks are verified manually (steps provided). Backend is verified with PHPUnit (`php artisan test`).
- Run `vendor/bin/pint --dirty --format agent` only if PHP files are touched (Task 5).
- Reuse the existing notes-textarea class string from `asset-form-drawer.tsx`: `w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand`.

---

### Task 1: Shared `ContractDialogHeader` component

Extract the Edit form's header into a single presentational component so View and Edit are visually identical by construction.

**Files:**
- Create: `resources/js/components/contracts/contract-dialog-header.tsx`

**Interfaces:**
- Produces: `ContractDialogHeader({ icon: LucideIcon, eyebrow: string, title: string, code?: string, srDescription?: string })` — renders the type-icon tile, eyebrow, `DialogTitle` (with optional mono code chip), and an sr-only `DialogDescription`. Must be rendered inside a `DialogContent`.

- [ ] **Step 1: Create the component**

```tsx
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type LucideIcon } from 'lucide-react';

/**
 * Shared header for the contract View and Edit dialogs: a brand-tinted type-icon
 * tile, an uppercase eyebrow, the title with an optional mono code chip, and an
 * sr-only description for accessibility. Keeps both surfaces visually identical.
 */
export function ContractDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    code?: string;
    srDescription?: string;
}) {
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">{eyebrow}</div>
                <DialogTitle className="mt-0.5 flex items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{code}</span>
                    )}
                </DialogTitle>
            </div>
            <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `contract-dialog-header.tsx`.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/contracts/contract-dialog-header.tsx
git commit -m "feat(contracts): shared ContractDialogHeader for View/Edit dialogs"
```

---

### Task 2: Add notes field to Edit form + use shared header

Close the view-but-not-edit gap on `notes`, and swap the inline header for the shared component.

**Files:**
- Modify: `resources/js/components/contracts/contract-form-drawer.tsx`

**Interfaces:**
- Consumes: `ContractDialogHeader` from Task 1.

- [ ] **Step 1: Import the shared header**

In the import block at the top of `contract-form-drawer.tsx`, add:

```tsx
import { ContractDialogHeader } from '@/components/contracts/contract-dialog-header';
```

- [ ] **Step 2: Replace the inline header with the shared component**

Find the header block (the `<div className="flex items-center gap-3 px-6 pt-5 pb-4">` through its closing `</div>`, including the inner `DialogTitle` and `DialogDescription`) and replace the whole block with:

```tsx
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={editing ? (lang === 'th' ? 'แก้ไขสัญญา' : 'Edit contract') : lang === 'th' ? 'สัญญาใหม่' : 'New contract'}
                    title={editing ? (lang === 'th' ? 'แก้ไขสัญญา' : 'Edit contract') : t('new_contract')}
                    code={editing ? editing.code : undefined}
                    srDescription={t('contract_register_sub')}
                />
```

Note: `DialogTitle` and `DialogDescription` are now provided by `ContractDialogHeader`; remove their now-unused imports from the `@/components/ui/dialog` import line if they are no longer referenced elsewhere in the file (keep `Dialog`, `DialogContent`).

- [ ] **Step 3: Add the notes textarea to Step 2 (Contract details)**

In `step === 1`, inside the left-column `<div className="space-y-5">`, after the `contract_name` `Field` (the `name` input), add a new full-width notes field. Place it just before the closing `</div>` of the left column:

```tsx
                                        <Field label={lang === 'th' ? 'หมายเหตุ' : 'Notes'}>
                                            <textarea
                                                value={form.notes}
                                                onChange={(e) => upd('notes', e.target.value)}
                                                rows={3}
                                                placeholder={lang === 'th' ? 'รายละเอียดเพิ่มเติม (ถ้ามี)' : 'Additional notes (optional)'}
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                                            />
                                        </Field>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (If `DialogTitle`/`DialogDescription` were left imported but unused, the build's lint will flag them — remove them.)

- [ ] **Step 5: Manual verification**

Run the app (`npm run dev` if not already running). Open a contract → Edit → Step 2 now shows a Notes textarea pre-filled with the contract's notes. The header shows the type icon, "แก้ไขสัญญา" eyebrow + title, and the code chip.

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/contracts/contract-form-drawer.tsx
git commit -m "feat(contracts): editable notes field + shared header in Edit wizard"
```

---

### Task 3: Convert View detail from Sheet → 1100px focus Dialog

Rebuild the read-only detail as a centered `Dialog` at the same 1100px width as Edit, with a two-column layout and the previously-missing `title` field.

**Files:**
- Modify (full rewrite): `resources/js/components/contracts/contract-detail-drawer.tsx`

**Interfaces:**
- Consumes: `ContractDialogHeader` from Task 1.
- Produces: `ContractDetailDrawer({ contract: Contract | null, onClose, onEdit, canEdit })` — unchanged props.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `contract-detail-drawer.tsx` with:

```tsx
import { ContractDialogHeader } from '@/components/contracts/contract-dialog-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useContractMutations } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import { type Contract, type ContractType } from '@/types';
import { Ban, Cog, ExternalLink, FileText, Laptop, type LucideIcon, Package, SquarePen, Wifi } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Asset status → StatusBadge tone for the linked-assets list. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    maintenance: 'amber',
    writeoff: 'red',
};

/** Icon per contract type — mirrors the icons used by the Edit wizard's type cards. */
const TYPE_ICON: Record<ContractType, LucideIcon> = {
    software: FileText,
    hardware: Laptop,
    service: Cog,
    connectivity: Wifi,
    other: Package,
};

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A single label/value pair in the particulars grid. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
        </div>
    );
}

/** Small uppercase section heading used in the right column. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">{children}</div>
    );
}

/**
 * Read-only contract detail rendered as a centered 1100px focus dialog — the same
 * shell as the Edit wizard so View ↔ Edit feels like one surface. Left column holds
 * the particulars; right column holds the notification schedule, linked assets,
 * attachments, and notes.
 */
export function ContractDetailDrawer({
    contract,
    onClose,
    onEdit,
    canEdit,
}: {
    contract: Contract | null;
    onClose: () => void;
    onEdit: (c: Contract) => void;
    canEdit: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { cancel } = useContractMutations();

    if (!contract) return null;

    /**
     * Cancel flow. Hardware contracts may only be cancelled once every linked
     * asset is written off — otherwise warn and stop. All cancels then require a
     * final confirmation. The backend enforces the same rule (422).
     */
    const handleCancel = async () => {
        if (contract.type === 'hardware') {
            const pending = contract.linked_assets.filter((a) => a.status !== 'writeoff');
            if (pending.length > 0) {
                await confirm({
                    variant: 'warn',
                    hideCancel: true,
                    title: lang === 'th' ? 'ยังยกเลิกสัญญาไม่ได้' : 'Cannot cancel yet',
                    description:
                        lang === 'th'
                            ? `ต้อง write-off ทรัพย์สินที่ผูกกับสัญญานี้ให้ครบก่อน ยังเหลืออีก ${pending.length} รายการ`
                            : `Every linked asset must be written off first. ${pending.length} asset(s) still need write-off.`,
                    confirmText: lang === 'th' ? 'เข้าใจแล้ว' : 'Got it',
                });
                return;
            }
        }

        await confirm({
            variant: 'danger',
            title: lang === 'th' ? 'ยืนยันยกเลิกสัญญา?' : 'Cancel this contract?',
            entity: { name: contract.name, sub: contract.code },
            confirmText: t('contract_cancel'),
            action: async () => {
                await cancel.mutateAsync(contract.id);
                onClose();
            },
        });
    };

    const days = contract.days_remaining;
    const cancelled = contract.status === 'cancelled';
    const tone = cancelled ? 'gray' : contract.status === 'expired' ? 'red' : contract.in_reminder ? 'amber' : 'green';
    const statusLabel = cancelled
        ? t('contract_cancelled')
        : contract.status === 'expired'
          ? lang === 'th'
              ? 'หมดอายุ'
              : 'Expired'
          : lang === 'th'
            ? 'ใช้งาน'
            : 'Active';
    const TypeIcon = TYPE_ICON[contract.type] ?? FileText;

    return (
        <Dialog
            open={!!contract}
            onOpenChange={(o) => {
                if (!o) onClose();
            }}
        >
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={lang === 'th' ? 'สัญญา' : 'Contract'}
                    title={contract.title || contract.name}
                    code={contract.code}
                    srDescription={contract.vendor}
                />

                {/* Body — only this scrolls */}
                <div className="border-border/60 flex-1 space-y-6 overflow-y-auto border-t px-6 py-6">
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                        {contract.in_reminder && (
                            <StatusBadge tone="amber">{lang === 'th' ? `หมดอายุใน ${days} วัน` : `Expires in ${days} days`}</StatusBadge>
                        )}
                    </div>

                    <div className="grid gap-8 md:grid-cols-2">
                        {/* Left — particulars */}
                        <div className="grid grid-cols-2 gap-4">
                            <KV label={t('contract_code')} value={contract.code} mono />
                            <KV label={t('contract_vendor')} value={contract.vendor} />
                            <div className="col-span-2">
                                <KV label={t('contract_title')} value={contract.title || '—'} />
                            </div>
                            <div className="col-span-2">
                                <KV label={t('contract_name')} value={contract.name} />
                            </div>
                            <KV label={t('contract_type')} value={t(`contract_type_${contract.type}`)} />
                            <KV label={t('contract_billing')} value={t(`contract_billing_${contract.billing_cycle}`)} />
                            <KV label={t('contract_start')} value={contract.start} mono />
                            <KV label={t('contract_end')} value={contract.end} mono />
                            <KV label={t('contract_value')} value={contract.value_display} mono />
                            <KV
                                label={t('contract_days_remaining')}
                                value={
                                    cancelled
                                        ? '—'
                                        : days >= 0
                                          ? `${days} ${lang === 'th' ? 'วัน' : 'days'}`
                                          : lang === 'th'
                                            ? `เกินกำหนด ${-days} วัน`
                                            : `${-days} days overdue`
                                }
                            />
                            <KV
                                label={t('contract_auto_renew')}
                                value={contract.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                            />
                            <KV
                                label={t('contract_reminder_threshold')}
                                value={
                                    contract.reminder_days
                                        ? `${contract.reminder_days} ${lang === 'th' ? 'วันก่อนหมดอายุ' : 'days before expiry'}`
                                        : '—'
                                }
                            />
                            {cancelled && contract.cancelled_at && <KV label={t('contract_cancelled_on')} value={contract.cancelled_at} mono />}
                            <KV label={t('contract_created')} value={contract.created_at ?? '—'} mono />
                            <KV label={t('contract_updated')} value={contract.updated_at ?? '—'} mono />
                        </div>

                        {/* Right — schedule, assets, attachments, notes */}
                        <div className="space-y-6">
                            {/* Notification schedule — alerts are sent automatically by the
                                daily contracts:send-expiry-alerts command (bell + email). */}
                            <div>
                                <SectionLabel>{t('contract_notification_schedule')}</SectionLabel>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        { d: 150, on: contract.notify_150 },
                                        { d: 120, on: contract.notify_120 },
                                        { d: 90, on: contract.notify_90 },
                                        { d: 60, on: contract.notify_60 },
                                        { d: 45, on: contract.notify_45 },
                                        { d: 30, on: contract.notify_30 },
                                        { d: 7, on: contract.notify_7 },
                                    ].map((n) => (
                                        <span
                                            key={n.d}
                                            className={cn(
                                                'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                                                n.on
                                                    ? 'border-brand/30 bg-brand/10 text-brand'
                                                    : 'border-border text-muted-foreground/40 line-through',
                                            )}
                                        >
                                            {n.d}
                                            {lang === 'th' ? ' วัน' : 'd'}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Linked assets — shown whenever the contract has assets linked (any type). */}
                            {contract.linked_assets.length > 0 && (
                                <div>
                                    <SectionLabel>
                                        {t('contract_link_assets')}
                                        <span className="font-mono text-[11px] tracking-normal normal-case">{contract.linked_assets.length}</span>
                                    </SectionLabel>
                                    <div className="space-y-1.5">
                                        {contract.linked_assets.map((a) => (
                                            <Link
                                                key={a.id}
                                                to={`/assets?view=${a.id}`}
                                                className="border-border hover:border-brand/50 hover:bg-accent/40 group flex items-center gap-3 rounded-md border px-3 py-2 transition-colors"
                                                title={t('asset_view')}
                                            >
                                                <span className="font-mono text-xs">{a.tag}</span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-medium">{a.name}</div>
                                                    <div className="text-muted-foreground truncate text-xs">
                                                        {[a.type, a.serial, a.owner].filter(Boolean).join(' · ') || '—'}
                                                    </div>
                                                </div>
                                                {a.status && (
                                                    <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge>
                                                )}
                                                <ExternalLink className="text-muted-foreground group-hover:text-brand h-3.5 w-3.5 shrink-0" />
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Attachments — PDF documents, opens in a new tab. */}
                            <div>
                                <SectionLabel>{t('contract_attachments')}</SectionLabel>
                                {contract.attachments.length === 0 ? (
                                    <div className="bg-muted/50 text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
                                        {t('attachment_none')}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {contract.attachments.map((a) => (
                                            <a
                                                key={a.id}
                                                href={a.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="border-border hover:bg-accent/50 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                            >
                                                <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                                                <span className="hover:text-brand min-w-0 flex-1 truncate">{a.name}</span>
                                                <span className="text-muted-foreground shrink-0 text-xs">{formatSize(a.size)}</span>
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {contract.notes && (
                                <div>
                                    <SectionLabel>{lang === 'th' ? 'หมายเหตุ' : 'Notes'}</SectionLabel>
                                    <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer — Close / Edit / Cancel contract */}
                <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-2 border-t px-6 py-3.5">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {canEdit && !cancelled && (
                        <Button variant="outline" className="flex-1" onClick={() => onEdit(contract)}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </Button>
                    )}
                    {canEdit && !cancelled && (
                        <Button variant="destructive" className="flex-1" onClick={handleCancel} disabled={cancel.isPending}>
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. The `Sheet`/`SheetContent`/etc. imports are gone; confirm nothing else in the file references them.

- [ ] **Step 3: Manual verification**

Open a contract from the table → it now opens as a centered 1100px dialog (not a right drawer). Left column shows particulars including **Title**; right column shows schedule chips, linked assets, attachments, and notes (when present). Footer shows Close / Edit / Cancel. For a cancelled contract, Edit and Cancel are hidden.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/contracts/contract-detail-drawer.tsx
git commit -m "feat(contracts): View detail as 1100px focus dialog matching Edit"
```

---

### Task 4: Continuous View → Edit → View flow

Keep the viewed contract selected when editing, suppress the View while the form is open (one modal at a time), and reappear on the View with refreshed data after save/close.

**Files:**
- Modify: `resources/js/pages/contracts/index.tsx`

**Interfaces:**
- Consumes: `ContractDetailDrawer`, `ContractFormDrawer` (unchanged props).

- [ ] **Step 1: Stop clearing the selection when opening Edit**

Find `openEdit` (around line 187):

```tsx
    const openEdit = (c: Contract) => {
        setSelectedId(null);
        setEditing(c);
        setFormOpen(true);
    };
```

Replace with (drop the `setSelectedId(null)` so the View stays selected underneath):

```tsx
    // Open the Edit wizard over the current View. selectedId is kept so that
    // closing the form returns the user to the (now refreshed) detail dialog.
    const openEdit = (c: Contract) => {
        setEditing(c);
        setFormOpen(true);
    };
```

- [ ] **Step 2: Gate the View dialog so only one modal shows at a time**

Find the render of `ContractDetailDrawer` (around line 599):

```tsx
            <ContractDetailDrawer contract={selected ?? null} onClose={() => setSelectedId(null)} onEdit={openEdit} canEdit={canEdit} />
```

Replace with (hide the View while the form is open, without losing `selectedId`):

```tsx
            <ContractDetailDrawer
                contract={formOpen ? null : (selected ?? null)}
                onClose={() => setSelectedId(null)}
                onEdit={openEdit}
                canEdit={canEdit}
            />
```

- [ ] **Step 3: Manual verification — the full loop**

1. Open a contract → View dialog (1100px).
2. Click **Edit** → the View closes and the Edit wizard opens at the same size/position (reads as an in-place switch; no double backdrop).
3. Change the **Notes** and one other field → **Save** → the form closes and the **View reappears showing the updated values**.
4. Click **Edit** again → **Back/Cancel** the form (no save) → returns to the View unchanged.
5. From the View, **Cancel contract** → confirm → everything closes.
6. From the table, **New contract** (create) → save → lands on the All tab with the new row pinned (unchanged behavior); no stray View opens.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/contracts/index.tsx
git commit -m "feat(contracts): return to View after Edit; one modal at a time"
```

---

### Task 5: Backend — lock `notes` update round-trip (PHPUnit)

The notes field is now editable from the UI. Add a test asserting it persists through the update endpoint so the contract stays covered.

**Files:**
- Modify: `tests/Feature/ContractApiTest.php`
- Test: same file

**Interfaces:**
- Consumes: existing `Contract` factory and the authenticated-request setup already used in this test file.

- [ ] **Step 1: Inspect the existing test file's conventions**

Run: `php artisan test --compact tests/Feature/ContractApiTest.php`
Expected: existing suite PASSES. Note how it authenticates (e.g. `actingAs`), how it builds a contract (factory), and the update route name/URL it uses, so the new test matches the file's style.

- [ ] **Step 2: Add the failing-then-passing test**

Add this method to the `ContractApiTest` class. Adjust `actingAs(...)`, the route (`/api/contracts/{id}` vs a named route), and any required payload fields to match the patterns already in the file (copy them from the existing update/store test in this same file):

```php
/** Notes entered in the Edit form persist through the update endpoint. */
public function test_contract_notes_round_trip_through_update(): void
{
    $user = User::factory()->create(['role' => 'super']);
    $contract = Contract::factory()->create(['notes' => null]);

    $payload = array_merge($contract->only([
        'code', 'vendor', 'title', 'name', 'type', 'start_date', 'end_date',
        'value', 'billing_cycle',
    ]), [
        'start_date' => $contract->start_date,
        'end_date' => $contract->end_date,
        'notes' => 'Renewed with vendor on 2026-06-30.',
        'notify_30' => true,
    ]);

    $this->actingAs($user)
        ->putJson("/api/contracts/{$contract->id}", $payload)
        ->assertOk();

    $this->assertDatabaseHas('contracts', [
        'id' => $contract->id,
        'notes' => 'Renewed with vendor on 2026-06-30.',
    ]);
}
```

> If the existing tests build the update payload via a helper or a full `$contract->toArray()`, reuse that instead of the `only()` list above — the key assertion is just that `notes` round-trips. Ensure `use App\Models\User;` and `use App\Models\Contract;` are present at the top of the file.

- [ ] **Step 3: Run the new test**

Run: `php artisan test --compact --filter=test_contract_notes_round_trip_through_update`
Expected: PASS. If it fails on validation (missing required field), add the field to `$payload` by copying from the existing update test in the same file.

- [ ] **Step 4: Run the full contract suite + Pint**

Run: `php artisan test --compact tests/Feature/ContractApiTest.php`
Expected: all PASS.
Run: `vendor/bin/pint --dirty --format agent`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add tests/Feature/ContractApiTest.php
git commit -m "test(contracts): assert notes round-trips through update"
```

---

## Self-Review

**Spec coverage:**
- Shared chrome → Task 1 (header) + Tasks 2–3 use it; both at 1100px `Dialog`. ✓
- View as 1100px two-column read dialog + `title` added → Task 3. ✓
- Edit `notes` field → Task 2. ✓
- Continuous flow (keep `selectedId`, gate View `!formOpen`, return to View) → Task 4. ✓
- One-modal-at-a-time decision → Task 4 Step 2. ✓
- No backend changes; notes round-trip locked by test → Task 5. ✓
- Out of scope (no file renames, create flow unchanged, reminder representation unchanged) → respected. ✓

**Placeholder scan:** No TBD/TODO. Task 5 intentionally instructs matching the file's existing auth/route/payload conventions because they are not yet in context — Step 1 surfaces them before Step 2 writes the test; the assertion target (`notes`) is concrete.

**Type consistency:** `ContractDialogHeader` signature is identical in Tasks 1, 2, 3. `TYPE_ICON` uses `ContractType` keys matching `@/types`. `ContractDetailDrawer` props unchanged, so Task 4's call sites stay valid.
