import { useT } from '@/lang';
import { AccessBadge, useMyAccess } from '@/modules/access';
import { useAuth } from '@/modules/auth';
import { formatDateTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import type { Asset, EmployeeAccessRow } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useMutationState } from '@tanstack/react-query';
import {
    AppWindow,
    Boxes,
    Check,
    Clock,
    FolderClosed,
    Inbox,
    KeyRound,
    Loader2,
    type LucideIcon,
    Mail,
    Package,
    Share2,
    Tag,
    Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { AssetTypeIcon } from '../components/asset-meta';
import { AssetTagBadge } from '../components/asset-tag-badge';
import { ACCEPT_KEY, useAssetMutations, useMyAssets } from '../hooks/use-assets';

/** The kinds of thing a person can hold, in the order the page lists them. */
const KIND_ORDER = ['asset', 'software', 'file_share', 'email_group', 'social'] as const;
type Kind = (typeof KIND_ORDER)[number];

/**
 * Icon and colour per kind.
 *
 * The four access colours are the ones the Access registry already gives each channel
 * (access-dashboard.tsx), so a file share is the same teal wherever somebody meets it. Assets
 * keep the brand colour: they are this module's own subject, not one of access's channels.
 * Colour is what lets a long mixed list be scanned by shape and hue rather than read line by
 * line — the group headings carry the words.
 */
const KIND_META: Record<Kind, { icon: LucideIcon; color: string; labelKey: string }> = {
    asset: { icon: Package, color: '#2563eb', labelKey: 'mya_kind_asset' },
    software: { icon: AppWindow, color: '#f59e0b', labelKey: 'mya_kind_software' },
    file_share: { icon: FolderClosed, color: '#0d9488', labelKey: 'mya_kind_file_share' },
    email_group: { icon: Mail, color: '#7c3aed', labelKey: 'mya_kind_email_group' },
    social: { icon: Share2, color: '#6366f1', labelKey: 'mya_kind_social' },
};

/**
 * One thing this person holds, whatever kind it is.
 *
 * Assets and access grants arrive from two endpoints with nothing in common but the person
 * they belong to. Flattening them here is what lets the page be one list the reader scans
 * rather than four they have to join up in their head.
 */
interface Holding {
    key: string;
    kind: Kind;
    name: string;
    /** Second line: serial / share path / group address / brand. */
    detail: string | null;
    /** Since when — handed over, or granted. */
    since: string | null;
    /** Assets only: the row the return button acts on. */
    asset?: Asset;
    /** Access only: the level granted, and whether this person owns the resource. */
    level?: string | null;
    purpose?: string | null;
    isOwner?: boolean;
}

/** A small dot separator between condensed metadata items. */
function Sep() {
    return <span className="bg-muted-foreground/50 h-[3px] w-[3px] shrink-0 rounded-full" />;
}

/**
 * Summary tile — mirrors the StatCard used across the app (Assets/Contracts/Tickets):
 * label top-left, a tinted icon chip top-right, big mono value below.
 */
function SummaryStat({
    icon: Icon,
    tone,
    value,
    label,
}: {
    icon: LucideIcon;
    tone: 'blue' | 'emerald' | 'amber' | 'violet';
    value: number;
    label: string;
}) {
    const toneCls = {
        blue: 'bg-brand/10 text-brand',
        emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
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

/** Turns one access grant into a holding row. */
function toHolding(kind: Exclude<Kind, 'asset'>, row: EmployeeAccessRow): Holding {
    return {
        key: `${kind}-${row.id}`,
        kind,
        name: row.resource_name ?? row.resource_code ?? '—',
        detail: row.resource_detail ?? row.resource_code ?? null,
        since: row.granted_at,
        level: row.access_level,
        purpose: row.purpose,
        isOwner: row.is_owner,
    };
}

/**
 * MyAssetsAccessPage — everything the signed-in person holds: the kit assigned to them and
 * the systems they can reach.
 *
 * The two used to be invisible: assets had their own page and access was recorded only in
 * IT's registry, so nobody could answer "what am I signed up to?" about themselves. They are
 * one list here because they are one question, filtered by chips rather than split into tabs —
 * tabs would hide from a reader who does not know which tab their answer is in.
 *
 * Actions stay on the asset half: accepting and returning kit is something the holder does.
 * Access is read-only by design — IT grants it by hand after an approved request, and a
 * button here would promise a flow that does not exist.
 */
export default function MyAssetsAccessPage() {
    const t = useT();
    const { user, can } = useAuth();
    const { data: assets = [], isLoading: assetsLoading } = useMyAssets(can('assets.my'));
    const { data: access, isLoading: accessLoading } = useMyAccess(can('access.my'));
    const { accept, requestReturn } = useAssetMutations();
    const confirm = useConfirm();

    // Ids with an accept in flight, read straight from the mutation cache (a local Set drifts
    // when a second accept starts before the first settles).
    const acceptingIds = useMutationState({
        filters: { mutationKey: ACCEPT_KEY, status: 'pending' },
        select: (mutation) => mutation.state.variables as number,
    });
    const onAccept = (id: number) => accept.mutate(id);

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
    const isLoading = assetsLoading || accessLoading;
    const pending = assets.filter((a) => a.status === 'pending_acceptance');
    const heldAssets = assets.filter((a) => a.status !== 'pending_acceptance');
    const returning = heldAssets.filter((a) => a.status === 'pending_return').length;

    const holdings: Holding[] = [
        ...heldAssets.map<Holding>((a) => ({
            key: `asset-${a.id}`,
            kind: 'asset',
            name: a.model ?? a.asset_code,
            detail: a.serial ?? a.asset_code,
            since: a.owned_since,
            asset: a,
        })),
        ...(access?.software ?? []).map((row) => toHolding('software', row)),
        ...(access?.file_shares ?? []).map((row) => toHolding('file_share', row)),
        ...(access?.email_groups ?? []).map((row) => toHolding('email_group', row)),
        ...(access?.social ?? []).map((row) => toHolding('social', row)),
    ];
    const accessCount = holdings.length - heldAssets.length;

    // Only kinds the reader actually holds get a chip: an empty filter is a dead end that
    // teaches nothing, and four of them make the row look like a menu of things to buy.
    const [kind, setKind] = useState<Kind | 'all'>('all');
    const kinds = KIND_ORDER.filter((k) => holdings.some((h) => h.kind === k));

    /**
     * Grouped, not one flat run.
     *
     * Everything in one list was hard to read the moment it got long: twenty rows with nothing
     * between them and no way to tell where kit ended and accounts began. A heading per kind
     * gives the eye somewhere to land and turns "what do I have?" into four short answers.
     *
     * Newest first inside each group — the thing somebody was given last week is the thing
     * they are least likely to remember having.
     */
    const groups = kinds
        .filter((k) => kind === 'all' || k === kind)
        .map((k) => ({
            kind: k,
            rows: holdings.filter((h) => h.kind === k).sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '')),
        }));
    const shownCount = groups.reduce((sum, g) => sum + g.rows.length, 0);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">{t('mya_title')}</h1>
                <p className="text-muted-foreground text-sm">{t('mya_sub')}</p>
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
                    {/* Three tiles that always mean something, plus two that appear only when
                        they do. The row used to open 0 · 0 · 0 · 4 for anybody without company
                        kit — a page whose whole job is "here is what you have" greeting them
                        with three zeros. Waiting-to-accept and going-back are passing states,
                        not standing figures. */}
                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                        <SummaryStat icon={Boxes} tone="blue" value={holdings.length} label={t('mya_total')} />
                        <SummaryStat icon={Package} tone="emerald" value={heldAssets.length} label={t('my_assets_held')} />
                        <SummaryStat icon={KeyRound} tone="violet" value={accessCount} label={t('mya_access_count')} />
                        {pending.length > 0 && <SummaryStat icon={Inbox} tone="emerald" value={pending.length} label={t('my_assets_awaiting')} />}
                        {returning > 0 && <SummaryStat icon={Clock} tone="amber" value={returning} label={t('my_assets_returning')} />}
                    </div>

                    {/* Assets awaiting the reader's action — the only thing on this page that
                        asks them to do something, so it stays above the list. */}
                    {pending.length > 0 && (
                        <div className="bg-card overflow-hidden rounded-xl border border-emerald-500/30 shadow-xs">
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
                                        disabled={acceptingIds.includes(a.id)}
                                    >
                                        {acceptingIds.includes(a.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                        {t('asset_accept')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <FilterChip active={kind === 'all'} onClick={() => setKind('all')} count={holdings.length}>
                                    {t('mya_kind_all')}
                                </FilterChip>
                                {kinds.map((k) => (
                                    <FilterChip
                                        key={k}
                                        active={kind === k}
                                        onClick={() => setKind(k)}
                                        count={holdings.filter((h) => h.kind === k).length}
                                    >
                                        {t(KIND_META[k].labelKey)}
                                    </FilterChip>
                                ))}
                            </div>
                            {shownCount > 0 && (
                                <span className="text-muted-foreground text-xs font-semibold">
                                    {shownCount} {t('my_assets_items')}
                                </span>
                            )}
                        </div>

                        {shownCount === 0 ? (
                            <Card className="text-muted-foreground flex flex-col items-center gap-2 p-10 text-center text-sm">
                                <Inbox className="text-muted-foreground/50 h-8 w-8" />
                                {t('mya_empty')}
                            </Card>
                        ) : (
                            groups.map((group) => {
                                const meta = KIND_META[group.kind];
                                const Icon = meta.icon;
                                return (
                                    <div key={group.kind}>
                                        {/* The heading is what makes a long list scannable: it says what the
                                            rows below are, so no row has to repeat its own kind. */}
                                        <div className="mb-2 flex items-center gap-2">
                                            <span
                                                className="flex h-6 w-6 items-center justify-center rounded-md"
                                                style={{ background: `${meta.color}1a`, color: meta.color }}
                                            >
                                                <Icon className="h-3.5 w-3.5" />
                                            </span>
                                            <span className="text-sm font-bold">{t(meta.labelKey)}</span>
                                            <span className="text-muted-foreground font-mono text-xs">{group.rows.length}</span>
                                        </div>
                                        <div className="bg-card border-border overflow-hidden rounded-xl border shadow-xs">
                                            {group.rows.map((h) => (
                                                <HoldingRow key={h.key} holding={h} t={t} onReturn={onReturn} returning={requestReturn} />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/** One filter chip: name plus how many rows it would leave. */
function FilterChip({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:border-brand/50 hover:bg-accent',
            )}
        >
            {children}
            <span className={cn('rounded-full px-1.5 text-[10px] font-bold', active ? 'bg-white/20' : 'bg-muted')}>{count}</span>
        </button>
    );
}

/**
 * One row of the unified list.
 *
 * Kit and access share a shape — icon, name, second line, since — and differ only at the
 * right edge, where an asset offers the one action its holder has and a grant states the
 * level it was given at.
 */
function HoldingRow({
    holding,
    t,
    onReturn,
    returning,
}: {
    holding: Holding;
    t: (key: string) => string;
    onReturn: (id: number, name: string, assetId: string) => void;
    returning: { isPending: boolean; variables?: { id: number } };
}) {
    const asset = holding.asset;
    const inUse = asset?.status === 'deployed';
    const meta = KIND_META[holding.kind];
    const Icon = meta.icon;

    return (
        <div className="border-border/60 hover:bg-accent/50 flex items-center gap-3 border-b px-5 py-3 transition-colors last:border-0">
            <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${meta.color}1a`, color: meta.color }}
            >
                {asset ? <AssetTypeIcon type={asset.type} className="h-[18px] w-[18px]" /> : <Icon className="h-[18px] w-[18px]" />}
            </div>

            {/* Everything the row says stays in one left-aligned block. Pushing the date and the
                level out to the far edge left ~900px of nothing across the middle of every row,
                and the eye had to cross it to pair a name with its own facts. */}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{holding.name}</span>
                    {asset?.tag && <AssetTagBadge tag={asset.tag} />}
                    {/* The registry's own badge, not a chip of my own: a "Write" grant reads as
                        "Read/Write" everywhere else in the app and has to here too. Only file
                        shares carry a level at all — the other three kinds have none. */}
                    {holding.level && <AccessBadge level={holding.level} />}
                    {holding.isOwner && (
                        <span className="shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                            {t('mya_owner')}
                        </span>
                    )}
                </div>
                {/* The group heading already said what kind this is, so the line spends itself on
                    what the heading cannot: state, address, why, and since when. */}
                <div className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
                    {asset && (
                        <>
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', inUse ? 'bg-emerald-500' : 'bg-amber-500')} />
                            <span className="shrink-0 font-semibold tracking-wide uppercase">
                                {inUse ? t('asset_deployed') : t('asset_pending_return')}
                            </span>
                        </>
                    )}
                    {holding.detail && (
                        <>
                            {asset && <Sep />}
                            <span className="truncate font-mono">{holding.detail}</span>
                        </>
                    )}
                    {holding.purpose && (
                        <>
                            <Sep />
                            <span className="truncate">{holding.purpose}</span>
                        </>
                    )}
                    {holding.since && (
                        <>
                            <Sep />
                            <span className="shrink-0 whitespace-nowrap">
                                {t('mya_since')} {formatDateTime(holding.since, false)}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Only kit has an action, and nothing is reserved for the rows that never will. */}
            {asset && inUse && (
                <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onReturn(asset.id, asset.model ?? '', asset.asset_code)}
                    disabled={returning.isPending && returning.variables?.id === asset.id}
                >
                    <Undo2 className="h-4 w-4" />
                    {t('asset_return')}
                </Button>
            )}
        </div>
    );
}
