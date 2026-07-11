import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { type ContractLinkedAsset, type ContractType } from '@/shared/types';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Clock, Cog, FileText, Laptop, Loader2, type LucideIcon, Package, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAssetContract } from '../hooks/use-assets';

/** Icon per contract type — mirrors the Contract detail drawer. */
const TYPE_ICON: Record<ContractType, LucideIcon> = {
    software: FileText,
    hardware: Laptop,
    service: Cog,
    connectivity: Wifi,
    other: Package,
};

/** Asset status → StatusBadge tone for the linked-assets table. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    writeoff: 'red',
};

type TabId = 'overview' | 'assets';

/** A single label/value pair in the Overview grids. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

/** Small uppercase section heading with a short brand accent underline (mirrors Contract/Asset detail). */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <div className="dark:text-foreground flex items-center gap-2 text-xs font-bold tracking-wide text-[#2f2f2f] uppercase">{children}</div>
            <div className="bg-brand/70 mt-1.5 h-0.5 w-8 rounded-full" />
        </div>
    );
}

/**
 * Read-only "peek" of the contract linked to an asset. Opened inline from the Asset detail
 * drawer so the user never leaves the Asset module. Shows the same Overview information as the
 * full Contract detail plus the contract's linked-assets list — but with NO tabs beyond those
 * two, NO footer, and NO actions (view only). It is deliberately separate from
 * ContractDetailDrawer, which owns the actionable contract view.
 *
 * Data is fetched via GET /assets/{asset}/contract, which is gated by assets.view — so anyone
 * who can view the asset can peek its linked contract (scoped to that one asset's contract),
 * without needing contracts.view or reaching the Contract module.
 */
export function ContractPeekDialog({ assetId, onClose }: { assetId: number | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [tab, setTab] = useState<TabId>('overview');

    // Retain the last opened asset id so the query keeps its data (and the dialog keeps rendering
    // content) while Radix animates the close transition after `assetId` goes null.
    const [shownAssetId, setShownAssetId] = useState<number | null>(assetId);
    useEffect(() => {
        if (assetId != null) setShownAssetId(assetId);
    }, [assetId]);

    // Reset to Overview whenever a (different) contract opens.
    useEffect(() => {
        setTab('overview');
    }, [assetId]);

    const { data: c, isLoading } = useAssetContract(shownAssetId);

    const open = assetId != null;
    const TypeIcon = c ? (TYPE_ICON[c.type] ?? FileText) : FileText;

    // Header status badge + days-remaining badge — same semantics as the full contract drawer.
    const terminal = c ? c.status === 'cancelled' || c.status === 'expired' : false;
    const cancelled = c?.status === 'cancelled';
    const tone: 'green' | 'amber' | 'red' | 'gray' = !c
        ? 'gray'
        : c.status === 'cancelled' || c.status === 'expired'
          ? 'gray'
          : c.status === 'overdue'
            ? 'red'
            : c.in_reminder
              ? 'amber'
              : 'green';
    const statusLabel = !c
        ? ''
        : c.status === 'cancelled'
          ? t('contract_cancelled')
          : c.status === 'expired'
            ? t('contract_expired')
            : c.status === 'overdue'
              ? t('contract_overdue')
              : lang === 'th'
                ? 'ใช้งาน'
                : 'Active';

    const days = c?.days_remaining ?? 0;
    const daysBadge =
        !c || terminal ? null : (
            <span
                className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold',
                    days <= 0
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : c.in_reminder
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-brand/30 bg-brand/10 text-brand',
                )}
            >
                <Clock className="h-3 w-3" />
                {days <= 0
                    ? lang === 'th'
                        ? `เกินกำหนด ${-days} วัน`
                        : `${-days} days overdue`
                    : c.in_reminder
                      ? lang === 'th'
                          ? `หมดอายุใน ${days} วัน`
                          : `Expires in ${days} days`
                      : lang === 'th'
                        ? `เหลือ ${days} วัน`
                        : `${days} days left`}
            </span>
        );

    const assetColumns: Column<ContractLinkedAsset>[] = [
        { key: 'asset_code', header: 'Asset ID', render: (a) => <span className="font-mono text-xs">{a.asset_code}</span> },
        { key: 'name', header: lang === 'th' ? 'ชื่อ' : 'Name', render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: lang === 'th' ? 'ประเภท' : 'Type', render: (a) => a.type ?? '—' },
        { key: 'serial', header: 'Serial', render: (a) => <span className="font-mono text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: lang === 'th' ? 'เจ้าของ' : 'Owner', render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: lang === 'th' ? 'สถานะ' : 'Status',
            render: (a) => (a.status ? <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge> : '—'),
        },
    ];

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'assets', label: lang === 'th' ? 'ทรัพย์สิน' : 'Assets', count: c?.linked_assets.length },
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 pt-5 pb-4">
                    <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                        <TypeIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">
                            {lang === 'th' ? 'สัญญา' : 'Contract'}
                        </div>
                        <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                            <span className="truncate">{c ? c.name || c.details || '—' : '—'}</span>
                            {c?.code && (
                                <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                                    {c.code}
                                </span>
                            )}
                            {c && (
                                <span className="bg-accent text-muted-foreground shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                    {t(`contract_type_${c.type}`)}
                                </span>
                            )}
                            {daysBadge}
                        </DialogTitle>
                    </div>
                    {c && (
                        <div className="ml-auto flex shrink-0 flex-col items-end gap-1 pr-8">
                            <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                            <div className="text-muted-foreground text-right text-[10.5px] leading-tight">
                                <div>
                                    {t('contract_created')}: {c.created_at ?? '—'}
                                </div>
                                <div>
                                    {t('contract_updated')}: {c.updated_at ?? '—'}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogDescription className="sr-only">{c?.name ?? ''}</DialogDescription>
                </div>

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

                {/* Body */}
                <div className={cn('min-h-0 flex-1', tab === 'overview' ? 'overflow-y-auto px-6 py-6' : 'overflow-hidden p-6')}>
                    {isLoading || !c ? (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : tab === 'overview' ? (
                        <div className="space-y-7">
                            {/* ข้อมูลสัญญา */}
                            <div>
                                <SectionLabel>{t('contract_section_info')}</SectionLabel>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div className="sm:col-span-3">
                                        <KV label={t('contract_type')} value={t(`contract_type_${c.type}`)} />
                                    </div>
                                    <KV label={t('contract_code')} value={c.code} mono />
                                    <KV label={t('contract_vendor')} value={c.vendor} />
                                    <KV label={t('contract_name')} value={c.name} />
                                    <div className="sm:col-span-3">
                                        <KV label={t('contract_details')} value={c.details || '—'} />
                                    </div>
                                    <div className="sm:col-span-3">
                                        <KV
                                            label={t('contract_notes')}
                                            value={c.notes ? <span className="whitespace-pre-wrap">{c.notes}</span> : '—'}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ระยะเวลา & มูลค่า */}
                            <div>
                                <SectionLabel>{t('contract_section_term')}</SectionLabel>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <KV label={t('contract_start')} value={c.start} mono />
                                    <KV label={t('contract_end')} value={c.end} mono />
                                    <KV
                                        label={t('contract_duration')}
                                        value={(() => {
                                            const mo = lang === 'th' ? 'เดือน' : c.duration_months === 1 ? 'month' : 'months';
                                            const dy = lang === 'th' ? 'วัน' : c.duration_days === 1 ? 'day' : 'days';
                                            if (c.duration_months > 0 && c.duration_days > 0)
                                                return `${c.duration_months} ${mo} ${c.duration_days} ${dy}`;
                                            if (c.duration_months > 0) return `${c.duration_months} ${mo}`;
                                            return `${c.duration_days} ${dy}`;
                                        })()}
                                    />
                                    <KV label={t('contract_billing')} value={t(`contract_billing_${c.billing_cycle}`)} />
                                    <KV label={t('contract_value_per_cycle')} value={c.value_display} mono />
                                    <KV label={t('contract_total_value')} value={c.total_value_display || '—'} mono />
                                </div>
                            </div>

                            {/* ยกเลิก & สิ้นสุดสัญญา — terminal contracts only */}
                            {terminal && (
                                <div>
                                    <SectionLabel>{t('contract_section_closure')}</SectionLabel>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        {cancelled && c.cancelled_at && <KV label={t('contract_cancelled_on')} value={c.cancelled_at} mono />}
                                        {c.status === 'expired' && c.expired_at && <KV label={t('contract_expired_on')} value={c.expired_at} mono />}
                                        {cancelled && c.cancel_reason && (
                                            <div className="sm:col-span-3">
                                                <KV label={t('contract_cancel_reason')} value={c.cancel_reason} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : c.linked_assets.length === 0 ? (
                        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                            <Package className="text-muted-foreground/50 h-8 w-8" />
                            {lang === 'th' ? 'สัญญานี้ยังไม่ได้ผูกทรัพย์สิน' : 'No assets linked to this contract'}
                        </div>
                    ) : (
                        <div className="h-full">
                            <DataTable
                                fillHeight
                                columns={assetColumns}
                                rows={c.linked_assets}
                                rowKey={(a) => a.id}
                                searchable={(a) => `${a.asset_code} ${a.name} ${a.serial ?? ''}`}
                            />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
