// My Profile drawer, Assets tab: hand-overs waiting for the reader's acceptance first,
// then the assets they hold, each with its return action.
import { useT } from '@/lang';
import { ACCEPT_KEY, AssetTagBadge, AssetTypeIcon, useAssetMutations } from '@/modules/asset';
import { HELD_STATUS_META } from '@/modules/employee';
import { EmptyPane } from '@/shared/components/empty-pane';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useUiStore } from '@/stores/ui';
import { useMutationState } from '@tanstack/react-query';
import { Check, Inbox, Laptop, Link2Off, Loader2, Undo2 } from 'lucide-react';

// Column template shared by both tables; Tag and Serial columns from lg up
const ROW_GRID =
    'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_104px] lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_120px] items-center gap-3 px-4';
const WIDE_ONLY = 'hidden lg:block';

/** A small dot separator between condensed metadata items. */
function Sep({ className }: { className?: string }) {
    return <span className={cn('bg-muted-foreground/50 h-[3px] w-[3px] shrink-0 rounded-full', className)} />;
}

function ColumnHeader({ dateLabel }: { dateLabel: string }) {
    const t = useT();
    return (
        <div className={cn(ROW_GRID, 'bg-muted border-border text-muted-foreground border-b py-2 text-[11px] font-bold tracking-wide uppercase')}>
            <div>{t('emp_v_col_device')}</div>
            <div className={WIDE_ONLY}>{t('emp_v_col_tag')}</div>
            <div className={WIDE_ONLY}>{t('emp_v_col_serial')}</div>
            <div>{dateLabel}</div>
            <div />
        </div>
    );
}

function TagCell({ tag }: { tag: string | null }) {
    return (
        <div className={cn('min-w-0', WIDE_ONLY)}>{tag ? <AssetTagBadge tag={tag} /> : <span className="text-muted-foreground text-xs">—</span>}</div>
    );
}

function SerialCell({ asset }: { asset: Asset }) {
    return <div className={cn('truncate font-mono text-xs', WIDE_ONLY)}>{asset.serial ?? asset.asset_code}</div>;
}

// Serial on the device cell's second line below lg
function InlineSerial({ asset }: { asset: Asset }) {
    return (
        <>
            <Sep className="lg:hidden" />
            <span className="truncate font-mono lg:hidden">{asset.serial ?? asset.asset_code}</span>
        </>
    );
}

export function MyAssetsTab({ assets, loading, linked, canReturn }: { assets: Asset[]; loading: boolean; linked: boolean; canReturn: boolean }) {
    const t = useT();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { accept, requestReturn } = useAssetMutations();

    // Ids with an accept in flight, read from the mutation cache
    const acceptingIds = useMutationState({
        filters: { mutationKey: ACCEPT_KEY, status: 'pending' },
        select: (mutation) => mutation.state.variables as number,
    });

    if (!linked) return <EmptyPane icon={Link2Off} text={t('my_assets_no_link')} />;

    if (loading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="bg-muted h-12 animate-pulse rounded-xl" />
                ))}
            </div>
        );
    }

    const pending = assets.filter((a) => a.status === 'pending_acceptance');
    const held = assets.filter((a) => a.status !== 'pending_acceptance');
    const typeLabel = (a: Asset) => (lang === 'th' ? (a.type_th ?? a.type) : a.type);

    const onReturn = (a: Asset) =>
        confirm({
            variant: 'warn',
            title: t('asset_return'),
            description: t('my_assets_return_confirm'),
            entity: { name: a.model ?? a.asset_code, sub: a.asset_code },
            confirmText: t('asset_return'),
            action: () => requestReturn.mutateAsync({ id: a.id }),
        });

    return (
        <div className="flex flex-col gap-3.5">
            {/* Pending acceptance */}
            {pending.length > 0 && (
                <div className="bg-card overflow-hidden rounded-xl border border-emerald-500/30 shadow-xs">
                    <div className="flex items-center gap-2 border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-[13px] font-extrabold text-emerald-700 dark:text-emerald-400">
                        <Inbox className="h-4 w-4 shrink-0" aria-hidden />
                        {t('profile_assets_pending_caption')}
                        <span className="font-mono font-bold">{pending.length}</span>
                    </div>
                    <ColumnHeader dateLabel={t('profile_assets_col_handed_over')} />
                    {pending.map((a, i) => {
                        const accepting = acceptingIds.includes(a.id);
                        return (
                            <div key={a.id} className={cn(ROW_GRID, 'min-h-[52px] bg-emerald-500/[0.04] py-2', i > 0 && 'border-border/60 border-t')}>
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                        <AssetTypeIcon type={a.type} className="h-4 w-4" />
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-xs font-bold">{a.model ?? a.asset_code}</span>
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                {t('my_assets_new')}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
                                            <span className="shrink-0">{typeLabel(a)}</span>
                                            <InlineSerial asset={a} />
                                            {a.last_reason && (
                                                <>
                                                    <Sep />
                                                    <span className="truncate">{a.last_reason}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <TagCell tag={a.tag} />
                                <SerialCell asset={a} />
                                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{fmt.dateTime(a.handed_over_at)}</div>
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        onClick={() => accept.mutate(a.id)}
                                        disabled={accepting}
                                    >
                                        {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        {t('asset_accept')}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Held */}
            <div className="mt-0.5 flex items-center gap-2">
                <span className="text-sm font-bold">{t('profile_assets_held_heading')}</span>
                <span className="text-muted-foreground font-mono text-xs">{held.length}</span>
            </div>
            {held.length === 0 ? (
                <EmptyPane icon={Laptop} text={t('my_assets_empty')} />
            ) : (
                <div className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
                    <ColumnHeader dateLabel={t('emp_v_col_received')} />
                    {held.map((a, i) => {
                        const meta = HELD_STATUS_META[a.status] ?? null;
                        return (
                            <div key={a.id} className={cn(ROW_GRID, 'min-h-12 py-2', i > 0 && 'border-border/60 border-t')}>
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                                        <AssetTypeIcon type={a.type} className="h-4 w-4" />
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <span className="truncate text-xs font-medium">{a.model ?? a.asset_code}</span>
                                        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px] font-medium">
                                            <span className="truncate">{typeLabel(a)}</span>
                                            <span className={cn('ml-1 h-1.5 w-1.5 shrink-0 rounded-full', meta?.dot ?? 'bg-muted-foreground')} />
                                            <span className="shrink-0">{meta ? t(meta.key) : a.status}</span>
                                            <InlineSerial asset={a} />
                                        </div>
                                    </div>
                                </div>
                                <TagCell tag={a.tag} />
                                <SerialCell asset={a} />
                                <div className="text-muted-foreground text-xs font-semibold">{fmt.date(a.owned_since)}</div>
                                <div className="flex justify-end">
                                    {canReturn && a.status === 'deployed' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onReturn(a)}
                                            disabled={requestReturn.isPending && requestReturn.variables?.id === a.id}
                                        >
                                            <Undo2 className="h-4 w-4" />
                                            {t('asset_return')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
