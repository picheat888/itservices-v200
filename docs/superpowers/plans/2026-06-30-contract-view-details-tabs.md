# Contract View Details — Tabbed Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the contract View Details dialog as a tabbed surface (Overview / Assets / Attachments), move the status + days-remaining badges into the header, make the Assets tab a fill-height paginated data table whose rows open the asset detail, and give Attachments an in-dialog PDF preview.

**Architecture:** Keep the 1100px centered `Dialog` shell. Add two optional slots to the shared `ContractDialogHeader`. Add an opt-in `fillHeight` mode to the shared `DataTable`. Split the View body into a tab bar + three panels, with Assets and Attachments extracted into their own focused components. No backend changes.

**Tech Stack:** React 19 + TypeScript, Radix Dialog, Tailwind v4, TanStack Query, lucide-react.

## Global Constraints

- No inline styles — Tailwind classes only (the mockup's raw CSS is a reference, not the implementation).
- TypeScript everywhere; components PascalCase; comment every function you create.
- No dependency changes; no backend/API/DB changes.
- No frontend test runner exists — verify each task with `npx tsc --noEmit` (paste the literal output filtered to the touched file) plus the manual checks named in the task. Pre-existing type errors in unrelated files are out of scope; zero errors in touched files.
- Staging discipline: the working tree has unrelated uncommitted work in other modules. Each task stages ONLY its own file(s) by explicit path — NEVER `git add -A` / `git add .`.
- `fillHeight` on DataTable must be opt-in and default OFF so every existing table renders unchanged.
- Notes/text blocks render with `whitespace-pre-wrap`. Reuse existing i18n keys (`contract_*`, `asset_*`); use inline `lang === 'th' ? … : …` only where the current detail component already does.

---

### Task 1: DataTable `fillHeight` mode

Add an opt-in mode where the table body grows to fill its container, the page size is computed from the available height (no rows-per-page picker), and only Prev/Next + a range label remain.

**Files:**
- Modify: `resources/js/components/shared/data-table.tsx`

**Interfaces:**
- Produces: `DataTable` gains `fillHeight?: boolean`. When true and not server-paginated, the client page size is derived from the container height. Default/omitted → current behavior unchanged.

- [ ] **Step 1: Add the prop to the interface**

In `interface DataTableProps<T>`, after the `maxBodyHeight` field, add:

```tsx
    /** Fill the parent's height: rows-per-page is computed from the available height,
     *  the rows-per-page picker is hidden, and the body never scrolls (page over instead).
     *  Opt-in; requires the parent to give the table a definite height. */
    fillHeight?: boolean;
```

- [ ] **Step 2: Destructure the prop and add the auto-size measurement**

Add `fillHeight` to the destructured params (next to `maxBodyHeight`). Then add `useEffect`, `useRef` to the React import at the top (it currently imports `{ useMemo, useState }`):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
```

Inside the component, after the existing `const [clientPage, setClientPage] = useState(1);` line, add:

```tsx
    // fillHeight: measure the body container and derive how many rows fit.
    const bodyRef = useRef<HTMLDivElement>(null);
    const [autoSize, setAutoSize] = useState(10);
    useEffect(() => {
        if (!fillHeight) return;
        const el = bodyRef.current;
        if (!el) return;
        const ROW_H = 45; // approx rendered row height (slightly over-estimated so rows never clip)
        const THEAD_H = 40; // approx header row height
        const compute = () => {
            const h = el.clientHeight;
            if (h > 0) setAutoSize(Math.max(1, Math.floor((h - THEAD_H) / ROW_H)));
        };
        compute();
        const ro = new ResizeObserver(compute);
        ro.observe(el);
        return () => ro.disconnect();
    }, [fillHeight]);
```

- [ ] **Step 3: Use the auto size as the client page size**

Change the `pageSize` line:

```tsx
    const pageSize = server ? server.pageSize : clientPageSize;
```

to:

```tsx
    const pageSize = server ? server.pageSize : fillHeight ? autoSize : clientPageSize;
```

- [ ] **Step 4: Make the root a flex column and the table wrapper fill it (only when fillHeight)**

Change the root wrapper:

```tsx
        <div className="space-y-3">
```

to:

```tsx
        <div className={cn(fillHeight ? 'flex h-full flex-col gap-3' : 'space-y-3')}>
```

Then change the table wrapper `<div>` (the one with `border-border rounded-xl border`) to attach the ref and fill when `fillHeight`:

```tsx
            <div
                ref={bodyRef}
                className={cn(
                    'border-border rounded-xl border',
                    fillHeight ? 'min-h-0 flex-1 overflow-hidden' : maxBodyHeight ? 'overflow-y-auto' : 'overflow-hidden',
                )}
                style={maxBodyHeight && !fillHeight ? { maxHeight: maxBodyHeight } : undefined}
            >
```

- [ ] **Step 5: Hide the rows-per-page picker in fillHeight mode**

Wrap the "Rows per page" block (the `<div className="flex items-center gap-2">` containing the `Select` of `PAGE_SIZES`) so it only renders when not `fillHeight`. Replace its opening:

```tsx
                    <div className="flex items-center gap-2">
                        <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
```

Wrap that whole `<div>…</div>` like so — when `fillHeight`, render an empty spacer to keep the range/nav right-aligned:

```tsx
                    {fillHeight ? (
                        <span />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                            {/* …existing Select unchanged… */}
                        </div>
                    )}
```

(Keep the `Select` block exactly as-is inside the `else` branch. The outer `{!hidePagination && (…)}` wrapper stays — fillHeight still shows the Prev/Next + range.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors referencing `data-table.tsx`.

- [ ] **Step 7: Manual regression check**

Open any existing table that does NOT pass `fillHeight` (e.g. the Contracts list tab, or a Stock table). Confirm it looks and paginates exactly as before (rows-per-page picker present, normal layout).

- [ ] **Step 8: Commit**

```bash
git add resources/js/components/shared/data-table.tsx
git commit -m "feat(datatable): opt-in fillHeight mode (auto page size, no scroll)"
```

---

### Task 2: ContractDialogHeader — `titleSuffix` + `headerRight` slots

Let the View enrich the shared header (days-remaining badge after the code chip; status badge at the right by the ✕) without affecting the Edit wizard.

**Files:**
- Modify: `resources/js/components/contracts/contract-dialog-header.tsx`

**Interfaces:**
- Produces: `ContractDialogHeader` gains optional `titleSuffix?: React.ReactNode` (rendered after the code chip inside the title) and `headerRight?: React.ReactNode` (rendered at the header's right edge, padded to clear the ✕).

- [ ] **Step 1: Replace the component with the extended version**

Replace the whole file with:

```tsx
import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type LucideIcon } from 'lucide-react';

/**
 * Shared header for the contract View and Edit dialogs: a brand-tinted type-icon
 * tile, an uppercase eyebrow, the title with an optional mono code chip and an
 * optional title-suffix slot (e.g. a days-remaining badge), an optional right-edge
 * slot (e.g. a status badge), and an sr-only description for accessibility.
 */
export function ContractDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
    titleSuffix,
    headerRight,
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    code?: string;
    srDescription?: string;
    /** Rendered inside the title row, right after the code chip (e.g. days-remaining badge). */
    titleSuffix?: React.ReactNode;
    /** Rendered at the header's right edge, left of the dialog's ✕ close button (e.g. status badge). */
    headerRight?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">{eyebrow}</div>
                <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{code}</span>
                    )}
                    {titleSuffix}
                </DialogTitle>
            </div>
            {headerRight && <div className="ml-auto flex shrink-0 items-center gap-2 pr-8">{headerRight}</div>}
            <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors referencing `contract-dialog-header.tsx`. The Edit wizard (which passes neither new prop) is unaffected.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/contracts/contract-dialog-header.tsx
git commit -m "feat(contracts): add titleSuffix + headerRight slots to ContractDialogHeader"
```

---

### Task 3: Contract Attachments tab component

A two-column panel: file list (middle-truncated names, own scroll) + an in-dialog PDF preview that fills the frame.

**Files:**
- Create: `resources/js/components/contracts/contract-attachments-tab.tsx`

**Interfaces:**
- Consumes: `ContractAttachment` from `@/types` (`{ id, name, size, url }`).
- Produces: `ContractAttachmentsTab({ attachments: ContractAttachment[] })`.

- [ ] **Step 1: Create the component**

```tsx
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type ContractAttachment } from '@/types';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Split a filename into [head, tail] for middle-truncation, keeping the extension visible. */
function splitName(name: string): [string, string] {
    const TAIL = 9; // keep this many chars on the right (covers ".pdf" + a few)
    if (name.length <= TAIL + 4) return [name, ''];
    return [name.slice(0, name.length - TAIL), name.slice(-TAIL)];
}

/** A filename rendered with a middle ellipsis: head truncates, tail (incl. extension) stays. */
function TruncName({ name, className }: { name: string; className?: string }) {
    const [head, tail] = splitName(name);
    return (
        <span className={cn('flex min-w-0', className)} title={name}>
            <span className="truncate">{head}</span>
            <span className="shrink-0 whitespace-nowrap">{tail}</span>
        </span>
    );
}

/** Attachments tab: file list on the left, an in-dialog PDF preview filling the frame on the right. */
export function ContractAttachmentsTab({ attachments }: { attachments: ContractAttachment[] }) {
    const t = useT();
    const [selected, setSelected] = useState(0);

    if (attachments.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <FileText className="text-muted-foreground/50 h-8 w-8" />
                {t('attachment_none')}
            </div>
        );
    }

    const active = attachments[Math.min(selected, attachments.length - 1)];

    return (
        <div className="grid h-full grid-cols-[280px_1fr] gap-4">
            {/* File list — own scroll; contracts cap attachments at 5 so it stays short. */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
                {attachments.map((a, i) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelected(i)}
                        className={cn(
                            'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            i === selected ? 'border-brand bg-brand/5 shadow-[inset_0_0_0_1px_var(--brand)]' : 'border-border hover:bg-accent/50',
                        )}
                    >
                        <span className="bg-destructive/10 text-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-extrabold">
                            PDF
                        </span>
                        <span className="min-w-0 flex-1">
                            <TruncName name={a.name} className="text-[13px] font-semibold" />
                            <span className="text-muted-foreground block font-mono text-[11.5px]">{formatSize(a.size)}</span>
                        </span>
                    </button>
                ))}
            </div>

            {/* Preview — iframe fills the frame. */}
            <div className="border-border flex min-h-0 flex-col overflow-hidden rounded-xl border">
                <div className="border-border/60 bg-card flex items-center gap-2 border-b px-3 py-2">
                    <TruncName name={active.name} className="flex-1 text-[12.5px] font-semibold" />
                    <a
                        href={active.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('open_new_tab')}
                    </a>
                    <a
                        href={active.url}
                        download
                        className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                    >
                        <Download className="h-3.5 w-3.5" />
                        {t('download')}
                    </a>
                </div>
                <iframe key={active.id} src={active.url} title={active.name} className="min-h-0 flex-1 bg-[#525659]" />
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Add i18n keys if missing**

`t('open_new_tab')` and `t('download')` — check `resources/js/lib/i18n.ts` for both keys. If either is missing, add it to BOTH the `en` and `th` maps next to other shared keys:
- `open_new_tab`: en `'Open in new tab'`, th `'เปิดแท็บใหม่'`
- `download`: en `'Download'`, th `'ดาวน์โหลด'`

> NOTE: `i18n.ts` is a shared file with unrelated uncommitted changes. If you must add keys, stage `i18n.ts` together with this task's commit (it is a required dependency of this component). If both keys already exist, do not touch `i18n.ts`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors referencing `contract-attachments-tab.tsx`.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/contracts/contract-attachments-tab.tsx
# add i18n.ts too ONLY if you added keys in Step 2:
# git add resources/js/lib/i18n.ts
git commit -m "feat(contracts): attachments tab with in-dialog PDF preview"
```

---

### Task 4: Contract Assets tab component

A fill-height `DataTable` of linked assets; clicking a row opens the asset detail drawer (read-only) after fetching the full asset by id.

**Files:**
- Create: `resources/js/components/contracts/contract-assets-tab.tsx`

**Interfaces:**
- Consumes: Task 1's `DataTable` `fillHeight`; `ContractLinkedAsset` from `@/types` (`{ id, tag, name, type, serial, status, owner }`); `assetApi.get(id) → Promise<Asset>`; `AssetDetailDrawer` from `@/components/assets/asset-detail-drawer`.
- Produces: `ContractAssetsTab({ assets: ContractLinkedAsset[] })`.

- [ ] **Step 1: Create the component**

```tsx
import { AssetDetailDrawer } from '@/components/assets/asset-detail-drawer';
import { StatusBadge } from '@/components/shared/status-badge';
import { type Column, DataTable } from '@/components/shared/data-table';
import { useT } from '@/lib/i18n';
import { assetApi } from '@/services/assetApi';
import { useUiStore } from '@/stores/ui';
import { type Asset, type ContractLinkedAsset } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';

/** Asset status → StatusBadge tone for the linked-assets table. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    maintenance: 'amber',
    writeoff: 'red',
};

/** Assets tab: a fill-height data table of the contract's linked assets; a row opens the asset detail (read-only). */
export function ContractAssetsTab({ assets }: { assets: ContractLinkedAsset[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [assetId, setAssetId] = useState<number | null>(null);

    // Linked assets carry only a subset of fields; fetch the full asset on demand for the detail drawer.
    const { data: asset } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: () => assetApi.get(assetId as number),
        enabled: assetId != null,
    });

    if (assets.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <Package className="text-muted-foreground/50 h-8 w-8" />
                {lang === 'th' ? 'สัญญานี้ยังไม่ได้ผูกทรัพย์สิน' : 'No assets linked to this contract'}
            </div>
        );
    }

    const columns: Column<ContractLinkedAsset>[] = [
        { key: 'tag', header: 'Tag', render: (a) => <span className="font-mono text-xs">{a.tag}</span> },
        { key: 'name', header: lang === 'th' ? 'ชื่อ' : 'Name', render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: lang === 'th' ? 'ประเภท' : 'Type', render: (a) => a.type ?? '—' },
        { key: 'serial', header: 'Serial', render: (a) => <span className="font-mono text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: lang === 'th' ? 'เจ้าของ' : 'Owner', render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: lang === 'th' ? 'สถานะ' : 'Status',
            render: (a) =>
                a.status ? <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge> : '—',
        },
    ];

    return (
        <div className="h-full">
            <DataTable
                fillHeight
                columns={columns}
                rows={assets}
                rowKey={(a) => a.id}
                searchable={(a) => `${a.tag} ${a.name} ${a.serial ?? ''}`}
                onRowClick={(a) => setAssetId(a.id)}
            />
            <AssetDetailDrawer
                asset={(asset as Asset) ?? null}
                onClose={() => setAssetId(null)}
                onTransfer={() => {}}
                onReceive={() => {}}
                canTransfer={false}
            />
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors referencing `contract-assets-tab.tsx`. (If `Column` is not exported from `data-table.tsx`, it is — confirmed at `data-table.tsx:9`.)

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/contracts/contract-assets-tab.tsx
git commit -m "feat(contracts): assets tab data table with nested asset detail"
```

---

### Task 5: Integrate tabs into ContractDetailDrawer

Restructure the View body into a tab bar + Overview/Assets/Attachments panels; move the status badge to the header right and the days-remaining badge to the title; drop the footer Close button.

**Files:**
- Modify (rewrite): `resources/js/components/contracts/contract-detail-drawer.tsx`

**Interfaces:**
- Consumes: `ContractDialogHeader` (`titleSuffix`, `headerRight`), `ContractAssetsTab`, `ContractAttachmentsTab`.
- Produces: `ContractDetailDrawer({ contract, onClose, onEdit, canEdit })` — props unchanged.

- [ ] **Step 1: Replace the file contents**

```tsx
import { ContractAssetsTab } from '@/components/contracts/contract-assets-tab';
import { ContractAttachmentsTab } from '@/components/contracts/contract-attachments-tab';
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
import { Ban, Clock, Cog, FileText, Laptop, type LucideIcon, Package, SquarePen, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Icon per contract type — mirrors the icons used by the Edit wizard's type cards. */
const TYPE_ICON: Record<ContractType, LucideIcon> = {
    software: FileText,
    hardware: Laptop,
    service: Cog,
    connectivity: Wifi,
    other: Package,
};

type TabId = 'overview' | 'assets' | 'attachments';

/** A single label/value pair in the Overview particulars grid. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
        </div>
    );
}

/** Small uppercase section heading. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">{children}</div>;
}

/**
 * Read-only contract detail rendered as a centered 1100px focus dialog with three tabs
 * (Overview / Assets / Attachments). Status + days-remaining badges live in the header.
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
    const [tab, setTab] = useState<TabId>('overview');

    // Reset to Overview whenever a (different) contract opens.
    useEffect(() => {
        setTab('overview');
    }, [contract?.id]);

    if (!contract) return null;

    /**
     * Cancel flow. Hardware contracts may only be cancelled once every linked asset is
     * written off — otherwise warn and stop. All cancels then require a final confirmation.
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

    // Days-remaining badge (header titleSuffix): hidden when cancelled; colored by state.
    const daysBadge = cancelled ? null : (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold',
                days <= 0
                    ? 'border-destructive/30 bg-destructive/10 text-destructive'
                    : contract.in_reminder
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'border-brand/30 bg-brand/10 text-brand',
            )}
        >
            <Clock className="h-3 w-3" />
            {days <= 0
                ? lang === 'th'
                    ? `เกินกำหนด ${-days} วัน`
                    : `${-days} days overdue`
                : contract.in_reminder
                  ? lang === 'th'
                      ? `หมดอายุใน ${days} วัน`
                      : `Expires in ${days} days`
                  : lang === 'th'
                    ? `เหลือ ${days} วัน`
                    : `${days} days left`}
        </span>
    );

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'assets', label: lang === 'th' ? 'ทรัพย์สิน' : 'Assets', count: contract.linked_assets.length },
        { id: 'attachments', label: lang === 'th' ? 'เอกสารแนบ' : 'Attachments', count: contract.attachments.length },
    ];

    return (
        <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={lang === 'th' ? 'สัญญา' : 'Contract'}
                    title={contract.title || contract.name}
                    code={contract.code}
                    srDescription={contract.vendor}
                    titleSuffix={daysBadge}
                    headerRight={<StatusBadge tone={tone}>{statusLabel}</StatusBadge>}
                />

                {/* Tab bar */}
                <div className="border-border/60 flex gap-1 border-b px-6">
                    {tabs.map((tb) => (
                        <button
                            key={tb.id}
                            type="button"
                            onClick={() => setTab(tb.id)}
                            className={cn(
                                'relative px-4 py-3 text-sm font-semibold transition-colors',
                                tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {tb.label}
                            {tb.count != null && tb.count > 0 && (
                                <span className="bg-accent ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[11px]">{tb.count}</span>
                            )}
                            {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
                        </button>
                    ))}
                </div>

                {/* Body — the active panel. Assets/Attachments fill & manage their own layout. */}
                <div className={cn('min-h-0 flex-1', tab === 'overview' ? 'overflow-y-auto px-6 py-6' : 'overflow-hidden p-6')}>
                    {tab === 'overview' && (
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

                            {/* Right — schedule + notes */}
                            <div className="space-y-6">
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
                                {contract.notes && (
                                    <div>
                                        <SectionLabel>{lang === 'th' ? 'หมายเหตุ' : 'Notes'}</SectionLabel>
                                        <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'assets' && <ContractAssetsTab assets={contract.linked_assets} />}
                    {tab === 'attachments' && <ContractAttachmentsTab attachments={contract.attachments} />}
                </div>

                {/* Footer — Cancel (left) / Edit (right); the ✕ handles closing. */}
                {canEdit && !cancelled && (
                    <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                        <Button variant="destructive" className="mr-auto" onClick={handleCancel} disabled={cancel.isPending}>
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </Button>
                        <Button variant="outline" onClick={() => onEdit(contract)}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors referencing `contract-detail-drawer.tsx`.

- [ ] **Step 3: Manual verification**

Run the app (`npm run dev`). Open a contract:
- Header: status badge top-right by ✕; days-remaining badge next to the code chip, colored by state (amber in reminder / red overdue / blue otherwise).
- Tabs open on **Overview**; counts show on Assets/Attachments; switching works.
- **Assets**: table fills the dialog, pages with Prev/Next (no inner scroll, no rows-per-page picker); a row click opens the asset detail drawer (read-only, Close only); empty state when none.
- **Attachments**: long names middle-truncate with tooltip; clicking a file swaps the preview; preview fills the frame; open-in-new-tab/download work; empty state when none.
- Footer: no Close button; Cancel left, Edit right; both hidden on a cancelled contract.
- From the table, Edit still opens the wizard and returns to this View (the open/close flow from the previous feature still works).

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/contracts/contract-detail-drawer.tsx
git commit -m "feat(contracts): tabbed View Details (Overview/Assets/Attachments) + header badges"
```

---

## Self-Review

**Spec coverage:**
- Status badge → header right: Task 2 (`headerRight`) + Task 5 (passes `StatusBadge`). ✓
- Days-remaining badge → title: Task 2 (`titleSuffix`) + Task 5 (`daysBadge`, state-colored). ✓
- Tabs Overview/Assets/Attachments + counts, opens on Overview, transient: Task 5. ✓
- Overview = particulars + schedule + notes (reminder badge removed from body): Task 5. ✓
- Assets data table, fill mode (no scroll/picker, Prev/Next), row → nested read-only AssetDetailDrawer: Task 1 + Task 4. ✓
- Attachments list + in-dialog PDF preview filling frame, middle-truncation + tooltip: Task 3. ✓
- Footer: Close removed, Cancel left / Edit right, smaller: Task 5. ✓
- No backend changes; DataTable fillHeight opt-in (regression check): Tasks state it; Task 1 Step 7. ✓

**Placeholder scan:** No TBD/TODO. i18n keys (`open_new_tab`, `download`) handled conditionally in Task 3 Step 2 with exact values.

**Type consistency:** `ContractDialogHeader` signature (Task 2) matches the props Task 5 passes (`titleSuffix`, `headerRight`). `DataTable` `fillHeight` (Task 1) matches Task 4's usage. `ContractAssetsTab({ assets })` / `ContractAttachmentsTab({ attachments })` signatures match Task 5's call sites. `Column`/`DataTable` imports come from `data-table.tsx` (exported). `assetApi.get` returns `Asset`, cast for `AssetDetailDrawer`.
