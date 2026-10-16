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
import { Check, CheckCheck, ChevronDown, ChevronUp, Inbox, Laptop, Link2Off, Loader2, Undo2 } from 'lucide-react';
import { useState } from 'react';

// Rows shown before "show all"
const PAGE = 5;

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
            <div className="text-center">{dateLabel}</div>
            <div />
        </div>
    );
}

function ShowAllRow({ total, expanded, onToggle }: { total: number; expanded: boolean; onToggle: () => void }) {
    const t = useT();
    if (total <= PAGE) return null;
    const Icon = expanded ? ChevronUp : ChevronDown;
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-1.5 border-t py-2 text-xs font-semibold transition-colors"
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {expanded ? t('profile_assets_show_less') : t('profile_assets_show_all').replace('{n}', String(total - PAGE))}
        </button>
    );
}

function TagCell({ tag }: { tag: string | null }) {
    return (
        <div className={cn('min-w-0', WIDE_ONLY)}>{tag ? <AssetTagBadge tag={tag} /> : <span className="text-muted-foreground text-xs">—</span>}</div>
    );
}

function SerialCell({ asset }: { asset: Asset }) {
    return <div className={cn('truncate text-xs', WIDE_ONLY)}>{asset.serial ?? asset.asset_code}</div>;
}

// Serial on the device cell's second line below lg
function InlineSerial({ asset }: { asset: Asset }) {
    return (
        <>
            <Sep className="lg:hidden" />
            <span className="truncate lg:hidden">{asset.serial ?? asset.asset_code}</span>
        </>
    );
}

export function MyAssetsTab({ assets, loading, linked, canReturn }: { assets: Asset[]; loading: boolean; linked: boolean; canReturn: boolean }) {
    const t = useT();
    const fmt = useDateFormat();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { accept, requestReturn } = useAssetMutations();
    const [showAllPending, setShowAllPending] = useState(false);
    const [showAllHeld, setShowAllHeld] = useState(false);
    // Accepted while this tab is open: the row stays put so the rows below never shift under a click
    const [settledIds, setSettledIds] = useState<Set<number>>(() => new Set());

    // Ids with an accept in flight, read from the mutation cache
    const acceptingIds = useMutationState({
        filters: { mutationKey: ACCEPT_KEY, status: 'pending' },
        select: (mutation) => mutation.state.variables as number,
    });

    const acceptOne = (id: number) => {
        setSettledIds((prev) => new Set(prev).add(id));
        return accept.mutateAsync(id).catch(() =>
            setSettledIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            }),
        );
    };

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
    // Rows accepted in this sitting keep their place in the pending table until the tab closes
    const pendingRows = assets.filter((a) => a.status === 'pending_acceptance' || settledIds.has(a.id));
    const held = assets.filter((a) => a.status !== 'pending_acceptance' && !settledIds.has(a.id));
    const pendingShown = showAllPending ? pendingRows : pendingRows.slice(0, PAGE);
    const heldShown = showAllHeld ? held : held.slice(0, PAGE);
    const acceptAll = () =>
        confirm({
            variant: 'edit',
            title: t('profile_assets_accept_all'),
            description: t('profile_assets_accept_all_confirm').replace('{n}', String(pending.length)),
            confirmText: t('profile_assets_accept_all'),
            action: () => Promise.all(pending.filter((a) => !acceptingIds.includes(a.id)).map((a) => acceptOne(a.id))).then(() => undefined),
        });
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
            {pendingRows.length > 0 && (
                <div className="bg-card overflow-hidden rounded-xl border border-emerald-500/30 shadow-xs">
                    <div className="flex items-center gap-2 border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-[13px] font-extrabold text-emerald-700 dark:text-emerald-400">
                        <Inbox className="h-4 w-4 shrink-0" aria-hidden />
                        {t('profile_assets_pending_caption')}
                        <span className="font-bold">{pending.length}</span>
                        {pending.length > 1 && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto h-7 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                                onClick={acceptAll}
                                disabled={acceptingIds.length > 0}
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                {t('profile_assets_accept_all')}
                            </Button>
                        )}
                    </div>
                    <ColumnHeader dateLabel={t('profile_assets_col_handed_over')} />
                    {pendingShown.map((a, i) => {
                        const accepting = acceptingIds.includes(a.id);
                        const accepted = a.status !== 'pending_acceptance';
                        return (
                            <div
                                key={a.id}
                                className={cn(
                                    ROW_GRID,
                                    'min-h-[52px] py-2',
                                    accepted ? 'bg-muted/40 opacity-70' : 'bg-emerald-500/[0.04]',
                                    i > 0 && 'border-border/60 border-t',
                                )}
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                                        <AssetTypeIcon type={a.type} className="h-4 w-4" />
                                    </div>
                                    <div className="flex min-w-0 flex-col gap-0.5">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate text-xs font-bold">{a.model ?? a.asset_code}</span>
                                            {!accepted && (
                                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    {t('my_assets_new')}
                                                </span>
                                            )}
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
                                <div className="text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                    {fmt.date(a.handed_over_at)}
                                </div>
                                <div className="flex justify-end">
                                    {accepted ? (
                                        <span className="text-muted-foreground inline-flex h-8 items-center gap-1.5 px-2 text-xs font-semibold">
                                            <CheckCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                            {t('profile_assets_accepted')}
                                        </span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            onClick={() => acceptOne(a.id)}
                                            disabled={accepting}
                                        >
                                            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                            {t('asset_accept')}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <ShowAllRow total={pendingRows.length} expanded={showAllPending} onToggle={() => setShowAllPending((v) => !v)} />
                </div>
            )}

            {/* Held */}
            <div className="mt-0.5 flex items-center gap-2">
                <span className="text-sm font-bold">{t('profile_assets_held_heading')}</span>
                <span className="text-muted-foreground text-xs">{held.length}</span>
            </div>
            {held.length === 0 ? (
                <EmptyPane icon={Laptop} text={t('my_assets_empty')} />
            ) : (
                <div className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
                    <ColumnHeader dateLabel={t('emp_v_col_received')} />
                    {heldShown.map((a, i) => {
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
                                <div className="text-muted-foreground text-center text-xs font-semibold">{fmt.date(a.owned_since)}</div>
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
                    <ShowAllRow total={held.length} expanded={showAllHeld} onToggle={() => setShowAllHeld((v) => !v)} />
                </div>
            )}
        </div>
    );
}
