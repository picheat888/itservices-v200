import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { cn } from '@/shared/lib/utils';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Check, Eye, RotateCcw, Share2, SquarePen, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAsset, useAssetMutations } from '../hooks/use-assets';
import { AssetHistoryTab } from './asset-history-tab';
import { AssetStatusBadge, AssetTypeIcon } from './asset-meta';
import { AssetTicketsTab } from './asset-tickets-tab';
import { ContractPeekDialog } from './contract-peek-dialog';

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

/** Small uppercase section heading with a short brand accent underline (mirrors Contract detail). */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="mb-3">
            <div className="dark:text-foreground flex items-center gap-2 text-xs font-bold tracking-wide text-[#2f2f2f] uppercase">{children}</div>
            <div className="bg-brand/70 mt-1.5 h-0.5 w-8 rounded-full" />
        </div>
    );
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
    onRecall,
    onEdit,
    canTransfer,
    canReceive,
    canForceRecall = false,
    canCancelWriteoff = false,
}: {
    asset: Asset | null;
    onClose: () => void;
    onTransfer: (a: Asset) => void;
    onReceive: (a: Asset) => void;
    onRecall?: (a: Asset) => void;
    onEdit?: (a: Asset) => void;
    canTransfer: boolean;
    canReceive: boolean;
    canForceRecall?: boolean;
    canCancelWriteoff?: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const [tab, setTab] = useState<TabId>('overview');

    // Recall from the footer asks for confirmation first (force recall pulls an asset an
    // employee still holds), then hands off to the warehouse-picker modal via onRecall.
    const askRecall = async (target: Asset, force: boolean) => {
        if (!onRecall) return;
        const ok = await confirm({
            variant: force ? 'danger' : 'warn',
            title: t('asset_recall_title'),
            entity: { name: target.model, sub: target.asset_code },
            description: t(force ? 'asset_force_recall_confirm' : 'asset_recall_confirm'),
            confirmText: t('asset_recall_action'),
        });
        if (ok) onRecall(target);
    };

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
    // The recipient (matched by employee code) is the only one who can accept a hand-over.
    const { user } = useAuth();
    const { accept, cancelWriteoff } = useAssetMutations();

    // Undo a write-off (wrong-retire fix) — restores the asset to the Ready pool.
    const askCancelWriteoff = async (target: Asset) => {
        await confirm({
            variant: 'edit',
            title: t('asset_cancel_writeoff'),
            entity: { name: target.model, sub: target.asset_code },
            description: t('asset_cancel_writeoff_confirm'),
            confirmText: t('asset_cancel_writeoff'),
            action: async () => {
                await cancelWriteoff.mutateAsync(target.id);
                onClose();
            },
        });
    };

    // Linked-contract peek — fetched via GET /assets/{id}/contract, which is gated by assets.view.
    // Anyone who can open this asset can peek its linked contract; no contracts.view needed.
    const [peekAssetId, setPeekAssetId] = useState<number | null>(null);

    const a = asset ?? shown;
    if (!a) return null;

    const enriched = full && full.id === a.id ? full : null;
    const transfers = enriched?.transfers ?? [];
    const tickets = enriched?.tickets ?? [];

    const rented = a.source === 'rented';
    const lifetime = !rented && a.warranty_lifetime;
    const myEmpCode = user?.employee_code ?? null;
    const isRecipient = a.status === 'pending_acceptance' && !!myEmpCode && a.owner === myEmpCode;

    const tabs: { id: TabId; label: string; count?: number }[] = [
        { id: 'overview', label: lang === 'th' ? 'ภาพรวม' : 'Overview' },
        { id: 'tickets', label: t('asset_tab_tickets'), count: enriched ? tickets.length : undefined },
        { id: 'history', label: lang === 'th' ? 'ประวัติ' : 'History', count: enriched ? transfers.length : undefined },
    ];

    return (
        <>
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
                                <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                                    {a.asset_code}
                                </span>
                                {a.tag && (
                                    <span className="bg-accent text-foreground inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                        <Tag className="h-3 w-3 opacity-60" />
                                        {a.tag}
                                    </span>
                                )}
                                <span className="bg-accent text-muted-foreground shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold">
                                    {a.type}
                                </span>
                                <span
                                    className={cn(
                                        'shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-semibold',
                                        rented
                                            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                                            : 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                                    )}
                                >
                                    {rented ? t('asset_lease') : t('asset_purchase')}
                                </span>
                            </DialogTitle>
                        </div>
                        <div className="ml-auto flex shrink-0 flex-col items-end gap-1 pr-8">
                            <AssetStatusBadge status={a.status} t={t} />
                            <div className="text-muted-foreground text-right text-[10.5px] leading-tight">
                                <div>
                                    {t('asset_registered')}: {a.registered_date ?? '—'}
                                </div>
                                <div>
                                    {t('asset_last_update')}: {a.updated_at ?? '—'}
                                </div>
                            </div>
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
                            <div className="space-y-7">
                                {/* General information — the linked contract sits here as a sub-field */}
                                <div>
                                    <SectionLabel>{t('asset_general')}</SectionLabel>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <KV label={t('asset_no')} value={a.asset_code} mono />
                                        <KV label={t('asset_tag_name')} value={a.tag} />
                                        <KV label={t('asset_warehouse')} value={a.warehouse} />
                                        <KV
                                            label={t('asset_nature')}
                                            value={
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                                                        rented
                                                            ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                                                            : 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                                                    )}
                                                >
                                                    {rented ? t('asset_lease') : t('asset_purchase')}
                                                </span>
                                            }
                                        />
                                        {a.contract_id && (
                                            <div className="space-y-0.5">
                                                <div className="text-muted-foreground text-xs">{t('asset_linked_contract')}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-sm">{a.contract_code ?? `#${a.contract_id}`}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPeekAssetId(a.id)}
                                                        title={t('asset_view_contract')}
                                                        aria-label={t('asset_view_contract')}
                                                        className="text-muted-foreground hover:text-brand hover:bg-brand/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Asset information */}
                                <div>
                                    <SectionLabel>{t('asset_information')}</SectionLabel>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <div className="sm:col-span-3">
                                            <KV label={t('asset_type')} value={a.type} />
                                        </div>
                                        <KV label={t('asset_brand')} value={a.brand} />
                                        <KV label={t('asset_model')} value={a.model} />
                                        <KV label={t('asset_serial')} value={a.serial} mono />
                                        {/* Purchase date, supplier, value & warranty are owned-only. For leased assets
                                        these belong to the contract — open Contract Details to view them. */}
                                        {!rented && (
                                            <>
                                                <KV label={t('asset_purchase_date')} value={a.purchase_date} mono />
                                                <KV label={t('asset_supplier')} value={a.supplier} />
                                                <KV label={t('asset_value')} value={a.value_display} mono />
                                                <KV
                                                    label={t('asset_warranty_end')}
                                                    value={
                                                        lifetime ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                                <Check className="h-3 w-3" />
                                                                {t('asset_lifetime')}
                                                            </span>
                                                        ) : (
                                                            a.warranty_end
                                                        )
                                                    }
                                                    mono={!lifetime}
                                                />
                                            </>
                                        )}
                                        <div className="sm:col-span-3">
                                            <KV
                                                label={t('asset_notes')}
                                                value={a.notes ? <span className="whitespace-pre-wrap">{a.notes}</span> : '—'}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Ownership */}
                                <div>
                                    <SectionLabel>{t('asset_ownership')}</SectionLabel>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                        <KV label={t('asset_employee_id')} value={a.owner} mono />
                                        <KV label={t('asset_owner_name')} value={a.owner_name} />
                                        <KV label={t('asset_position')} value={a.owner_position} />
                                        <KV label={t('asset_dept')} value={a.department} />
                                        <KV label={t('asset_location')} value={a.location} />
                                        <KV label={t('asset_owned_since')} value={a.owned_since} mono />
                                    </div>
                                </div>
                            </div>
                        )}

                        {tab === 'tickets' && <AssetTicketsTab tickets={tickets} />}
                        {tab === 'history' && <AssetHistoryTab transfers={transfers} />}
                    </div>

                    {/* Footer — context action (left) / Edit (right); the ✕ handles closing. */}
                    {(onEdit || canTransfer || canReceive || isRecipient || canForceRecall || (canCancelWriteoff && a.status === 'writeoff')) && (
                        <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                            {isRecipient && (
                                <Button onClick={() => accept.mutate(a.id, { onSuccess: onClose })} disabled={accept.isPending}>
                                    <Check className="h-4 w-4" />
                                    {t('asset_accept')}
                                </Button>
                            )}
                            {canReceive && a.status === 'pending_return' && (
                                <Button onClick={() => onReceive(a)}>
                                    <Check className="h-4 w-4" />
                                    {t('asset_mark_received')}
                                </Button>
                            )}
                            {canTransfer && a.status === 'ready' && (
                                <Button onClick={() => onTransfer(a)}>
                                    <Share2 className="h-4 w-4" />
                                    {t('asset_transfer_action')}
                                </Button>
                            )}
                            {/* Pull back a hand-over the recipient hasn't accepted yet (wrong-transfer undo). */}
                            {onRecall && canTransfer && a.status === 'pending_acceptance' && (
                                <Button variant="outline" onClick={() => onRecall(a)}>
                                    <RotateCcw className="h-4 w-4" />
                                    {t('asset_recall')}
                                </Button>
                            )}
                            {/* Bring a shared / common-use asset back into the pool — no holder to request its return. */}
                            {onRecall && canTransfer && a.status === 'common' && (
                                <Button variant="outline" onClick={() => askRecall(a, false)}>
                                    <RotateCcw className="h-4 w-4" />
                                    {t('asset_recall_action')}
                                </Button>
                            )}
                            {/* Force recall (super / assets.force_recall) — override to pull back an asset an
                                employee still holds; normally they'd return it themselves. */}
                            {onRecall && canForceRecall && a.status === 'deployed' && !!a.owner_employee_id && (
                                <Button
                                    variant="outline"
                                    onClick={() => askRecall(a, true)}
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    {t('asset_recall_action')}
                                </Button>
                            )}
                            {/* Undo a wrong write-off (permission-gated) — the only action on a retired asset. */}
                            {canCancelWriteoff && a.status === 'writeoff' && (
                                <Button variant="outline" onClick={() => askCancelWriteoff(a)} disabled={cancelWriteoff.isPending}>
                                    <RotateCcw className="h-4 w-4" />
                                    {t('asset_cancel_writeoff')}
                                </Button>
                            )}
                            {/* A written-off asset is frozen — no editing until the write-off is cancelled. */}
                            {onEdit && a.status !== 'writeoff' && (
                                <Button variant="outline" className="ml-auto" onClick={() => onEdit(a)}>
                                    <SquarePen className="h-4 w-4" />
                                    {t('edit')}
                                </Button>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
            <ContractPeekDialog assetId={peekAssetId} onClose={() => setPeekAssetId(null)} />
        </>
    );
}
