import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { Check, ChevronLeft, ChevronRight, Clock, Inbox, Loader2, type LucideIcon, Package, Tag, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { AssetTypeIcon } from '../components/asset-meta';
import { AssetTagBadge } from '../components/asset-tag-badge';
import { useAssetMutations, useMyAssets } from '../hooks/use-assets';

const HELD_PAGE_SIZES = [10, 20, 50];

/** A small dot separator between condensed metadata items. */
function Sep() {
    return <span className="bg-muted-foreground/50 h-[3px] w-[3px] shrink-0 rounded-full" />;
}

/**
 * Summary tile — mirrors the StatCard used across the app (Assets/Contracts/Tickets):
 * label top-left, a tinted icon chip top-right, big mono value below. The icon is tinted
 * per status (held / awaiting / returning) so the three read at a glance.
 */
function SummaryStat({ icon: Icon, tone, value, label }: { icon: LucideIcon; tone: 'blue' | 'emerald' | 'amber'; value: number; label: string }) {
    const toneCls = {
        blue: 'bg-brand/10 text-brand',
        emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    }[tone];
    return (
        <Card className="p-5">
            <div className="flex items-start justify-between">
                <div className="text-muted-foreground text-sm">{label}</div>
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneCls)}>
                    <Icon className="h-[18px] w-[18px]" />
                </span>
            </div>
            <div className="mt-2 font-mono text-3xl font-bold">{value}</div>
        </Card>
    );
}

/**
 * MyAssetsPage — employee self-service view of the assets assigned to the signed-in
 * user (matched by their employee code). An icon-led summary sits on top; hand-overs
 * pending the user's action are grouped in a single wrapper card with a compact
 * accept row each; the rest are listed read-only. No assets.view permission is required —
 * this is the employee-facing counterpart to the IT Asset module.
 */
export default function MyAssetsPage() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const { data: assets = [], isLoading } = useMyAssets();
    const { accept, requestReturn } = useAssetMutations();
    const confirm = useConfirm();

    // Ids with an accept request in flight. Tracked as a Set here (not via `accept.variables`)
    // because the mutation object only remembers its LATEST call — accepting a second asset
    // while the first is still saving would stop the first row's spinner.
    const [acceptingIds, setAcceptingIds] = useState<Set<number>>(new Set());
    const onAccept = (id: number) => {
        setAcceptingIds((prev) => new Set(prev).add(id));
        accept.mutate(id, {
            onSettled: () =>
                setAcceptingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                }),
        });
    };

    /** Ask before sending a held asset back to IT (goes to "pending return"). */
    const onReturn = (id: number, name: string, assetId: string) =>
        confirm({
            variant: 'warn',
            title: t('asset_return'),
            description: t('my_assets_return_confirm'),
            entity: { name, sub: assetId },
            confirmText: t('asset_return'),
            action: () => requestReturn.mutateAsync({ id }),
        });

    const linked = !!user?.employee_code;
    const pending = assets.filter((a) => a.status === 'pending_acceptance');
    const held = assets.filter((a) => a.status !== 'pending_acceptance');
    const returning = held.filter((a) => a.status === 'pending_return').length;

    // Client-side pagination for the held list.
    const [heldPage, setHeldPage] = useState(1);
    const [heldPageSize, setHeldPageSize] = useState(HELD_PAGE_SIZES[0]);
    const heldPageCount = Math.max(1, Math.ceil(held.length / heldPageSize));
    const heldSafePage = Math.min(heldPage, heldPageCount);
    const heldStart = (heldSafePage - 1) * heldPageSize;
    const pagedHeld = held.slice(heldStart, heldStart + heldPageSize);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('my_assets')}</h1>
                <p className="text-muted-foreground text-sm">{t('my_assets_sub')}</p>
            </div>

            {!linked ? (
                <Card className="text-muted-foreground flex items-center gap-3 p-6 text-sm">
                    <Inbox className="h-5 w-5 shrink-0" />
                    {t('my_assets_no_link')}
                </Card>
            ) : isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="bg-muted h-16 animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : (
                <>
                    {/* Icon-led summary — same StatCard footprint as the rest of the app. */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <SummaryStat icon={Package} tone="blue" value={held.length} label={t('my_assets_held')} />
                        <SummaryStat icon={Inbox} tone="emerald" value={pending.length} label={t('my_assets_awaiting')} />
                        <SummaryStat icon={Clock} tone="amber" value={returning} label={t('my_assets_returning')} />
                    </div>

                    {/* Assets awaiting the user's action — one wrapper card, compact accept rows. */}
                    {pending.length > 0 && (
                        <div className="bg-card overflow-hidden rounded-xl border border-emerald-500/30 shadow-xs">
                            {/* Banner: a solid emerald icon badge anchors the action queue; count on the right. */}
                            <div className="flex items-center gap-3 border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-3.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                                    <Inbox className="h-5 w-5" />
                                </span>
                                <div className="min-w-0">
                                    <div className="text-sm font-extrabold tracking-tight">{t('my_assets_pending_action')}</div>
                                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                        {pending.length} {t('my_assets_awaiting_hint')}
                                    </div>
                                </div>
                                <span className="ml-auto flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-emerald-600 px-2 font-mono text-[13px] font-bold text-white">
                                    {pending.length}
                                </span>
                            </div>

                            {pending.map((a, i) => (
                                <div
                                    key={a.id}
                                    className={cn(
                                        'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-emerald-500/[0.06]',
                                        i > 0 && 'border-border border-t',
                                    )}
                                >
                                    <div className="bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                        <AssetTypeIcon type={a.type} className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-bold">{a.model}</span>
                                            {/* "New" pill with a pulsing dot to signal a fresh hand-over. */}
                                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                                                <span className="relative flex h-1.5 w-1.5">
                                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                </span>
                                                {t('my_assets_new')}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                                            <span className="font-mono">{a.asset_code}</span>
                                            {a.tag && (
                                                <>
                                                    <Sep />
                                                    <span className="bg-accent text-foreground inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                                                        <Tag className="h-3 w-3 opacity-60" />
                                                        {a.tag}
                                                    </span>
                                                </>
                                            )}
                                            {a.last_reason && (
                                                <>
                                                    <Sep />
                                                    <span className="truncate">{a.last_reason}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        onClick={() => onAccept(a.id)}
                                        disabled={acceptingIds.has(a.id)}
                                    >
                                        {acceptingIds.has(a.id) ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Check className="h-4 w-4" />
                                        )}
                                        {t('asset_accept')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Assets I currently hold — a compact table (styled after the imported design). */}
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">{t('my_assets_held')}</span>
                            {held.length > 0 && (
                                <span className="text-muted-foreground text-xs font-semibold">
                                    {held.length} {t('my_assets_items')}
                                </span>
                            )}
                        </div>
                        {held.length === 0 ? (
                            <Card className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
                                <Inbox className="text-muted-foreground/50 h-8 w-8" />
                                {t('my_assets_empty')}
                            </Card>
                        ) : (
                            <div className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
                                <div className="overflow-x-auto">
                                    <div className="min-w-[680px]">
                                        {/* Column header */}
                                        <div className="bg-muted/40 border-border text-muted-foreground grid grid-cols-[minmax(0,1.7fr)_1fr_1.2fr_1fr_1fr] items-center gap-4 border-b px-5 py-3 text-[11.5px] font-semibold tracking-wide uppercase">
                                            <div>{t('my_assets_col_device')}</div>
                                            <div>{t('asset_nickname')}</div>
                                            <div>{t('my_assets_col_serial')}</div>
                                            <div>{t('my_assets_col_received')}</div>
                                            <div className="text-right">{t('asset_actions')}</div>
                                        </div>

                                        {pagedHeld.map((a) => {
                                            const inUse = a.status === 'deployed';
                                            return (
                                                <div
                                                    key={a.id}
                                                    className="border-border/60 hover:bg-accent/50 grid grid-cols-[minmax(0,1.7fr)_1fr_1.2fr_1fr_1fr] items-center gap-4 border-b px-5 py-3.5 transition-colors last:border-0"
                                                >
                                                    {/* Device */}
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div className="bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                                            <AssetTypeIcon type={a.type} className="h-[18px] w-[18px]" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-medium">{a.model}</div>
                                                            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide uppercase">
                                                                <span
                                                                    className={cn(
                                                                        'h-1.5 w-1.5 rounded-full',
                                                                        inUse ? 'bg-emerald-500' : 'bg-amber-500',
                                                                    )}
                                                                />
                                                                {lang === 'th' ? (a.type_th ?? a.type) : a.type} ·{' '}
                                                                {inUse ? t('asset_deployed') : t('asset_pending_return')}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Tag (nickname) — blue badge */}
                                                    <div className="min-w-0">
                                                        {a.tag ? (
                                                            <AssetTagBadge tag={a.tag} />
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">—</span>
                                                        )}
                                                    </div>

                                                    {/* Serial */}
                                                    <div className="text-foreground truncate font-mono text-xs">{a.serial ?? a.asset_code}</div>

                                                    {/* Received */}
                                                    <div className="text-muted-foreground text-xs font-semibold">{a.owned_since ?? '—'}</div>

                                                    {/* Actions */}
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {inUse && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => onReturn(a.id, a.model ?? '', a.asset_code)}
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
                                </div>
                            </div>
                        )}

                        {/* Pagination — rows-per-page + range on the left, page nav on the right. */}
                        {held.length > 0 && (
                            <div className="text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span>{lang === 'th' ? 'แสดง' : 'Rows per page'}</span>
                                        <Select
                                            value={String(heldPageSize)}
                                            onValueChange={(v) => {
                                                setHeldPageSize(Number(v));
                                                setHeldPage(1);
                                            }}
                                        >
                                            <SelectTrigger className="h-8 w-[72px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {HELD_PAGE_SIZES.map((s) => (
                                                    <SelectItem key={s} value={String(s)}>
                                                        {s}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <span>
                                        {heldStart + 1}–{Math.min(heldStart + heldPageSize, held.length)} {lang === 'th' ? 'จาก' : 'of'} {held.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setHeldPage(Math.max(1, heldSafePage - 1))}
                                        disabled={heldSafePage <= 1}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    <span className="text-foreground px-1 font-medium">
                                        {heldSafePage} / {heldPageCount}
                                    </span>
                                    <button
                                        onClick={() => setHeldPage(Math.min(heldPageCount, heldSafePage + 1))}
                                        disabled={heldSafePage >= heldPageCount}
                                        className="border-border hover:bg-accent flex h-8 w-8 items-center justify-center rounded-md border disabled:opacity-40"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
