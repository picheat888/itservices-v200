import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { DialogTabs } from '@/shared/components/dialog-tabs';
import { EmptyState } from '@/shared/components/empty-state';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import { cn } from '@/shared/lib/utils';
import { type ContractLinkedAsset, type ContractType } from '@/shared/types';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
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
function KV({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className="text-sm">{value || '—'}</div>
        </div>
    );
}

/** Small uppercase section heading with a short brand accent underline (mirrors Contract/Asset detail). */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-2">
            <div className="dark:text-foreground flex items-center gap-2 text-sm font-bold tracking-wide text-[#2f2f2f] uppercase">{children}</div>
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
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    const [tab, setTab] = useState<TabId>('overview');
    const [assetQuery, setAssetQuery] = useState('');

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

    // Each opening, and each tab switch, starts with an empty search.
    useEffect(() => {
        setAssetQuery('');
    }, [assetId, tab]);

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
              : t('active');

    const days = c?.days_remaining ?? 0;
    const daysBadge =
        !c || terminal ? null : (
            <span
                className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold',
                    days <= 0
                        ? 'border-destructive/30 bg-destructive/10 dark:text-destructive text-red-700'
                        : c.in_reminder
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-brand/30 bg-brand/10 text-brand',
                )}
            >
                <Clock className="h-3 w-3" />
                {days <= 0
                    ? t('contract_days_overdue').replace('{n}', fmtN(-days))
                    : c.in_reminder
                      ? t('contract_expires_in').replace('{n}', fmtN(days))
                      : t('contract_days_left').replace('{n}', fmtN(days))}
            </span>
        );

    const assetColumns: Column<ContractLinkedAsset>[] = [
        { key: 'asset_code', header: t('contract_asset_col_id'), render: (a) => <span className="text-xs">{a.asset_code}</span> },
        { key: 'name', header: t('asset_owner_name'), render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: t('asset_type'), render: (a) => localPair(a.type, a.type_th, lang) ?? '—' },
        { key: 'serial', header: t('contract_asset_col_serial'), render: (a) => <span className="text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: t('asset_peek_owner'), render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: t('asset_status'),
            render: (a) => (a.status ? <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge> : '—'),
        },
    ];

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: t('asset_overview') },
        { id: 'assets', label: t('assets'), count: c?.linked_assets.length },
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className={focusDialogContentClass}>
                {/* Header */}
                <FocusDialogHeader
                    icon={TypeIcon}
                    eyebrow={t('asset_contract')}
                    title={c ? c.name || c.details || '—' : '—'}
                    code={c?.code || undefined}
                    srDescription={c?.name ?? ''}
                    titleSuffix={
                        <>
                            {c && (
                                <span className="bg-accent text-muted-foreground shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                    {t(`contract_type_${c.type}`)}
                                </span>
                            )}
                            {daysBadge}
                        </>
                    }
                    headerRight={
                        c && (
                            <div className="flex flex-col items-end gap-1">
                                <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                                <div className="text-muted-foreground text-right text-[10.5px] leading-tight">
                                    <div>
                                        {t('contract_created')}: {fmt.date(c.created_at)}
                                    </div>
                                    <div>
                                        {t('contract_updated')}: {fmt.date(c.updated_at)}
                                    </div>
                                </div>
                            </div>
                        )
                    }
                />

                {/* Tab bar */}
                <DialogTabs className="px-6" tabs={tabs} active={tab} onChange={setTab} />

                {/* Body */}
                <div className={cn('min-h-0 flex-1', tab === 'overview' ? 'overflow-y-auto px-6 py-6' : 'overflow-hidden p-6')}>
                    {isLoading || !c ? (
                        <div className="text-muted-foreground flex h-full items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : tab === 'overview' ? (
                        <div className="space-y-5">
                            {/* ข้อมูลสัญญา */}
                            <div>
                                <SectionLabel>{t('contract_section_info')}</SectionLabel>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div className="sm:col-span-3">
                                        <KV label={t('contract_type')} value={t(`contract_type_${c.type}`)} />
                                    </div>
                                    <KV label={t('contract_code')} value={c.code} />
                                    <KV label={t('contract_vendor')} value={localPair(c.vendor, c.vendor_th, lang)} />
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
                                    <KV label={t('contract_start')} value={fmt.date(c.start)} />
                                    <KV label={t('contract_end')} value={fmt.date(c.end)} />
                                    <KV
                                        label={t('contract_duration')}
                                        value={(() => {
                                            const monthsText = t(c.duration_months === 1 ? 'contract_months_one' : 'contract_months_many').replace(
                                                '{n}',
                                                String(c.duration_months),
                                            );
                                            const daysText = t(c.duration_days === 1 ? 'contract_days_one' : 'contract_days_many').replace(
                                                '{n}',
                                                String(c.duration_days),
                                            );
                                            if (c.duration_months > 0 && c.duration_days > 0) return `${monthsText} ${daysText}`;
                                            if (c.duration_months > 0) return monthsText;
                                            return daysText;
                                        })()}
                                    />
                                    <KV label={t('contract_billing')} value={t(`contract_billing_${c.billing_cycle}`)} />
                                    <KV label={t('contract_value_per_cycle')} value={c.value_display} />
                                    <KV label={t('contract_total_value')} value={c.total_value_display || '—'} />
                                </div>
                            </div>

                            {/* ยกเลิก & สิ้นสุดสัญญา — terminal contracts only */}
                            {terminal && (
                                <div>
                                    <SectionLabel>{t('contract_section_closure')}</SectionLabel>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        {cancelled && c.cancelled_at && <KV label={t('contract_cancelled_on')} value={fmt.date(c.cancelled_at)} />}
                                        {c.status === 'expired' && c.expired_at && (
                                            <KV label={t('contract_expired_on')} value={fmt.date(c.expired_at)} />
                                        )}
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
                        <EmptyState
                            kind="empty"
                            title={t('asset_empty_contract_peek_assets')}
                            hint={t('asset_empty_contract_peek_assets_hint')}
                            className="h-full"
                        />
                    ) : (
                        <div className="h-full">
                            <DataTable
                                fillHeight
                                columns={assetColumns}
                                rows={c.linked_assets}
                                rowKey={(a) => a.id}
                                search={{ value: assetQuery, onChange: setAssetQuery }}
                                empty={{
                                    kind: 'search',
                                    title: t('asset_empty_contract_peek_assets_search'),
                                    hint: t('asset_empty_contract_peek_assets_search_hint'),
                                }}
                                searchPlaceholder={t('asset_contract_assets_search')}
                                searchable={(a) => `${a.asset_code} ${a.name} ${a.serial ?? ''}`}
                            />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
