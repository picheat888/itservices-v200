import { AssetHistoryTab } from './asset-history-tab';
import { AssetStatusBadge, AssetTypeIcon } from './asset-meta';
import { AssetTicketsTab } from './asset-tickets-tab';
import { useAsset } from '../hooks/use-assets';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/shared/types';
import { Check, ExternalLink, FileText, Share2, SquarePen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type TabId = 'overview' | 'tickets' | 'history';

/** A single label/value pair in the Overview meta grids. */
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

/** Small uppercase section heading. */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{children}</div>;
}

/** Whole days from today until an ISO date (negative = overdue); null when no date. */
function daysUntil(date: string | null): number | null {
    if (!date) {
        return null;
    }
    const end = new Date(date).getTime();
    if (Number.isNaN(end)) {
        return null;
    }
    return Math.ceil((end - Date.now()) / 86_400_000);
}

/**
 * Read-only asset detail rendered as a centered 1100px focus dialog with three tabs
 * (Overview / งานแจ้งซ่อม / History). The status badge lives in the header; the enriched
 * asset (transfer history + related tickets) is fetched by id while the dialog is open.
 */
export function AssetDetailDrawer({
    asset,
    onClose,
    onTransfer,
    onReceive,
    onEdit,
    canTransfer,
}: {
    asset: Asset | null;
    onClose: () => void;
    onTransfer: (a: Asset) => void;
    onReceive: (a: Asset) => void;
    onEdit?: (a: Asset) => void;
    canTransfer: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const navigate = useNavigate();
    const [tab, setTab] = useState<TabId>('overview');

    // Retain the last asset so the dialog keeps rendering content while it animates closed.
    const [shown, setShown] = useState<Asset | null>(asset);
    useEffect(() => {
        if (asset) setShown(asset);
    }, [asset]);

    // Reset to Overview whenever a (different) asset opens.
    useEffect(() => {
        setTab('overview');
    }, [asset?.id]);

    // Enriched asset (transfers + tickets) — Overview renders immediately from the list asset.
    const { data: full } = useAsset(asset?.id);

    const a = asset ?? shown;
    if (!a) return null;

    const enriched = full && full.id === a.id ? full : null;
    const transfers = enriched?.transfers ?? [];
    const tickets = enriched?.tickets ?? [];

    const rented = a.source === 'rented';
    const blocked = ['deployed', 'writeoff', 'pending_stock'].includes(a.status);

    // Coverage / warranty days-remaining sub-line for the KPI strip.
    const coverDays = daysUntil(a.cover_end);
    const coverSub =
        coverDays == null
            ? ''
            : coverDays < 0
              ? lang === 'th'
                  ? `เกินกำหนด ${-coverDays} วัน`
                  : `${-coverDays} days overdue`
              : lang === 'th'
                ? `เหลือ ${coverDays} วัน`
                : `${coverDays} days left`;
    const coverTone = coverDays == null ? '' : coverDays < 0 ? 'text-destructive' : coverDays <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'tickets', label: t('asset_tab_tickets'), count: enriched ? tickets.length : undefined },
        { id: 'history', label: lang === 'th' ? 'ประวัติ' : 'History', count: enriched ? transfers.length : undefined },
    ];

    return (
        <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 pt-5 pb-4">
                    <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                        <AssetTypeIcon type={a.type} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">
                            {lang === 'th' ? 'ทรัพย์สิน' : 'Asset'}
                        </div>
                        <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                            <span className="truncate">{a.model}</span>
                            <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{a.tag}</span>
                            <span className="bg-accent text-muted-foreground shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                {t(`asset_type_${a.type}`)}
                            </span>
                            <span className="bg-accent text-muted-foreground shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                {rented ? t('asset_lease') : t('asset_purchase')}
                            </span>
                        </DialogTitle>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2 pr-8">
                        <AssetStatusBadge status={a.status} t={t} />
                    </div>
                    <DialogDescription className="sr-only">{a.model}</DialogDescription>
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
                    {tab === 'overview' && (
                        <div className="space-y-6">
                            {/* KPI strip */}
                            <div className="border-border bg-muted/30 grid grid-cols-3 overflow-hidden rounded-xl border">
                                <div className="border-border/60 border-r px-5 py-3.5">
                                    <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">{t('asset_value')}</div>
                                    <div className="mt-1 font-mono text-xl font-bold">{a.value_display}</div>
                                    <div className="text-muted-foreground mt-0.5 text-xs">{rented ? t('asset_monthly_fee') : t('asset_purchase_price')}</div>
                                </div>
                                <div className="border-border/60 border-r px-5 py-3.5">
                                    <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                                        {rented ? t('asset_lease_end') : t('asset_warranty_end')}
                                    </div>
                                    <div className="mt-1 text-base font-semibold">{a.cover_end ?? '—'}</div>
                                    {coverSub && <div className={cn('mt-0.5 text-xs font-medium', coverTone)}>{coverSub}</div>}
                                </div>
                                <div className="px-5 py-3.5">
                                    <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">{t('asset_owner')}</div>
                                    <div className="mt-1 text-base font-semibold">{a.owner ?? '—'}</div>
                                    <div className="text-muted-foreground mt-0.5 text-xs">{a.department ?? '—'}</div>
                                </div>
                            </div>

                            <div className="grid gap-8 md:grid-cols-[1fr_300px]">
                                {/* Left — meta grids */}
                                <div className="space-y-6">
                                    <div>
                                        <SectionLabel>{t('asset_general')}</SectionLabel>
                                        <div className="grid grid-cols-2 gap-4">
                                            <KV label={t('asset_type')} value={t(`asset_type_${a.type}`)} />
                                            <KV label={t('asset_brand')} value={a.brand} />
                                            <KV label={t('asset_serial')} value={a.serial} mono />
                                            <KV label={t('asset_location')} value={a.location} />
                                            <KV label={t('asset_warehouse')} value={a.warehouse} />
                                        </div>
                                    </div>
                                    <div>
                                        <SectionLabel>{t('asset_ownership')}</SectionLabel>
                                        <div className="grid grid-cols-2 gap-4">
                                            <KV label={t('asset_owner')} value={a.owner} />
                                            <KV label={t('asset_initial_owner')} value={a.initial_owner} />
                                            <KV label={t('asset_dept')} value={a.department} />
                                            <KV label={t('asset_registered')} value={a.registered_date} mono />
                                        </div>
                                    </div>
                                    <div>
                                        <SectionLabel>{t('asset_acquisition')}</SectionLabel>
                                        <div className="grid grid-cols-2 gap-4">
                                            <KV label={t('asset_value')} value={a.value_display} mono />
                                            {rented ? (
                                                <>
                                                    <KV label={t('asset_lease_start')} value={a.lease_start} mono />
                                                    <KV label={t('asset_lease_end')} value={a.lease_end} mono />
                                                </>
                                            ) : (
                                                <>
                                                    <KV label={t('asset_purchase_date')} value={a.purchase_date} mono />
                                                    <KV label={t('asset_warranty_end')} value={a.warranty_end} mono />
                                                </>
                                            )}
                                            <KV label={t('asset_supplier')} value={a.supplier} />
                                        </div>
                                    </div>
                                    {a.notes && (
                                        <div>
                                            <SectionLabel>{t('asset_notes')}</SectionLabel>
                                            <p className="bg-muted/50 rounded-md px-3 py-2 text-sm whitespace-pre-wrap">{a.notes}</p>
                                        </div>
                                    )}
                                    {a.last_reason && (
                                        <div>
                                            <SectionLabel>{lang === 'th' ? 'เหตุผลล่าสุด' : 'Last reason'}</SectionLabel>
                                            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">{a.last_reason}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right rail — linked contract (rented only) */}
                                {rented && a.contract_id && (
                                    <div>
                                        <SectionLabel>{t('asset_linked_contract')}</SectionLabel>
                                        <div className="border-border rounded-xl border bg-gradient-to-b from-brand/[0.03] to-transparent p-4">
                                            <div className="mb-3 flex items-center gap-2.5">
                                                <div className="bg-brand/10 text-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                                                    <FileText className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="truncate font-mono text-sm font-semibold">{a.contract_code ?? `#${a.contract_id}`}</div>
                                                    <div className="text-muted-foreground text-xs">{rented ? t('asset_lease') : ''}</div>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 text-sm">
                                                <div className="flex justify-between border-b border-dashed border-border/60 pb-1.5">
                                                    <span className="text-muted-foreground">{t('asset_lease_start')}</span>
                                                    <span className="font-mono">{a.lease_start ?? '—'}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-dashed border-border/60 pb-1.5">
                                                    <span className="text-muted-foreground">{t('asset_lease_end')}</span>
                                                    <span className="font-mono">{a.lease_end ?? '—'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-muted-foreground">{t('asset_monthly_fee')}</span>
                                                    <span className="font-mono">{a.value_display}</span>
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                className="mt-3 w-full"
                                                onClick={() => {
                                                    onClose();
                                                    navigate(`/contracts?view=${a.contract_id}`);
                                                }}
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                                {t('asset_open_contract')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'tickets' && <AssetTicketsTab tickets={tickets} />}
                    {tab === 'history' && <AssetHistoryTab transfers={transfers} />}
                </div>

                {/* Footer — Edit (left) / context action (right); the ✕ handles closing. */}
                {(onEdit || canTransfer) && (
                    <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                        {onEdit && (
                            <Button variant="outline" className="mr-auto" onClick={() => onEdit(a)}>
                                <SquarePen className="h-4 w-4" />
                                {t('edit')}
                            </Button>
                        )}
                        {canTransfer && a.status === 'pending_return' && (
                            <Button className="ml-auto" onClick={() => onReceive(a)}>
                                <Check className="h-4 w-4" />
                                {t('asset_mark_received')}
                            </Button>
                        )}
                        {canTransfer && !blocked && a.status !== 'pending_return' && (
                            <Button className="ml-auto" onClick={() => onTransfer(a)}>
                                <Share2 className="h-4 w-4" />
                                {t('transfer_asset')}
                            </Button>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
