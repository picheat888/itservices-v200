import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { AccessKind, AccessSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import {
    AlertTriangle,
    CheckCircle2,
    Folder,
    Globe,
    LayoutGrid,
    type LucideIcon,
    Package,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    Users,
} from 'lucide-react';
import { useAccessSummary } from '../hooks/use-access';

/** Per-channel identity: brand-neutral colour (same hexes the registry NameCell uses) + icon + label key. */
const CHANNEL: Record<AccessKind, { color: string; icon: LucideIcon; labelKey: string }> = {
    'email-groups': { color: '#7c3aed', icon: Users, labelKey: 'access_email_groups' },
    'file-shares': { color: '#0d9488', icon: Folder, labelKey: 'access_file_shares' },
    'social-platforms': { color: '#6366f1', icon: Globe, labelKey: 'access_social' },
    software: { color: '#f59e0b', icon: Package, labelKey: 'access_software' },
};

/** The four channels in display order, mapping the summary key to its registry tab kind. */
const CHANNELS: { key: keyof AccessSummary['channels']; kind: AccessKind }[] = [
    { key: 'email_groups', kind: 'email-groups' },
    { key: 'file_shares', kind: 'file-shares' },
    { key: 'social', kind: 'social-platforms' },
    { key: 'software', kind: 'software' },
];

/** Soft tint used for channel icon tiles and badges (colour at ~12% over the card). */
function tint(color: string): React.CSSProperties {
    return { backgroundColor: `${color}1f`, color };
}

/**
 * A single governance-status row (icon + title/sub + trailing value). `tone`
 * drives the icon/value colour: amber = needs a look, red = act, green = clear,
 * ink = neutral information.
 */
function StatusRow({
    icon: Icon,
    tone,
    title,
    sub,
    value,
}: {
    icon: LucideIcon;
    tone: 'amber' | 'red' | 'green' | 'ink';
    title: string;
    sub: string;
    value: string | number;
}) {
    const toneClass = {
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-destructive',
        green: 'text-emerald-600 dark:text-emerald-400',
        ink: 'text-muted-foreground',
    }[tone];
    return (
        <div className="flex items-start gap-3 px-3 py-2.5">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass)} />
            <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-muted-foreground text-xs">{sub}</div>
            </div>
            <span className={cn('font-mono text-sm font-semibold', toneClass)}>{value}</span>
        </div>
    );
}

/**
 * Access Directory overview tab. Reads the aggregate summary and renders a KPI
 * row (one card per channel), the active-grant distribution, a governance-status
 * checklist, and the most-reached resources — all in the app's card/table idiom.
 * Clicking a KPI card or a table row opens that registry tab via `onOpenTab`.
 */
export function AccessDashboard({
    onOpenTab,
    onOpenResource,
}: {
    onOpenTab: (kind: AccessKind) => void;
    /** Open a specific resource: switch to its tab and open its manage drawer. */
    onOpenResource: (kind: AccessKind, id: number) => void;
}) {
    const t = useT();
    const { data, isLoading } = useAccessSummary();

    if (isLoading || !data) return <DashboardSkeleton />;

    const total = data.total_grants || 0;
    const maxGrants = Math.max(1, ...CHANNELS.map((c) => data.channels[c.key].grants));
    const gov = data.governance;

    return (
        <div className="space-y-4">
            {/* KPI row — one card per channel (count + last-30-day activity) */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {CHANNELS.map(({ key, kind }) => {
                    const stat = data.channels[key];
                    const meta = CHANNEL[kind];
                    const Icon = meta.icon;
                    // Signed 30-day change drives the delta line's arrow, wording and colour.
                    const net = stat.net_30d;
                    const deltaTone = net > 0 ? 'text-emerald-600 dark:text-emerald-400' : net < 0 ? 'text-destructive' : 'text-muted-foreground';
                    const deltaKey = net > 0 ? 'access_dash_up' : net < 0 ? 'access_dash_down' : 'access_dash_flat';
                    return (
                        <Card
                            key={kind}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenTab(kind)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpenTab(kind)}
                            className="hover:border-brand/40 cursor-pointer p-5 transition-colors"
                        >
                            <div className="flex items-start justify-between">
                                <div className="text-muted-foreground text-sm">{t(meta.labelKey)}</div>
                                <span className="bg-brand/10 text-brand flex h-9 w-9 items-center justify-center rounded-lg">
                                    <Icon className="h-[18px] w-[18px]" />
                                </span>
                            </div>
                            <div className="mt-2 font-mono text-3xl font-bold">{stat.resources}</div>
                            <div className={cn('mt-1 text-xs', deltaTone)}>{t(deltaKey).replace('{n}', String(Math.abs(net)))}</div>
                        </Card>
                    );
                })}
            </div>

            {/* Row 1: distribution + governance */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Access share */}
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="text-muted-foreground h-4 w-4" />
                            <span className="text-sm font-semibold">{t('access_dash_distribution_title')}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                            <b className="text-foreground font-mono font-bold">{total.toLocaleString()}</b> {t('access_dash_grants_total')}
                        </span>
                    </div>
                    <div className="space-y-4 p-5">
                        <p className="text-muted-foreground text-xs">{t('access_dash_distribution_cap')}</p>
                        {CHANNELS.map(({ key, kind }) => {
                            const grants = data.channels[key].grants;
                            const Icon = CHANNEL[kind].icon;
                            const pct = total > 0 ? Math.round((grants / total) * 100) : 0;
                            return (
                                <div key={kind} className="flex items-center gap-3">
                                    <Icon className="text-brand h-4 w-4 shrink-0" />
                                    <span className="w-28 shrink-0 text-sm whitespace-nowrap">{t(CHANNEL[kind].labelKey)}</span>
                                    <div className="bg-secondary h-2 flex-1 overflow-hidden rounded-full">
                                        <div className="bg-brand h-full rounded-full" style={{ width: `${(grants / maxGrants) * 100}%` }} />
                                    </div>
                                    <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold whitespace-nowrap">
                                        {grants} <span className="text-muted-foreground text-[11px] font-medium">{pct}%</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Governance status */}
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-muted-foreground h-4 w-4" />
                            <span className="text-sm font-semibold">{t('access_dash_governance_title')}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">{t('access_dash_latest')}</span>
                    </div>
                    <div className="divide-border/60 divide-y p-2">
                        {gov.empty_shares > 0 ? (
                            <StatusRow
                                icon={AlertTriangle}
                                tone="amber"
                                title={t('access_dash_empty_shares')}
                                sub={`“${gov.empty_shares_sample ?? ''}” ${t('access_dash_no_access_yet')}`}
                                value={gov.empty_shares}
                            />
                        ) : (
                            <StatusRow icon={CheckCircle2} tone="green" title={t('access_dash_shares_ok')} sub={t('access_dash_shares_ok_sub')} value="✓" />
                        )}

                        <StatusRow icon={TrendingUp} tone="ink" title={t('access_dash_recent_title')} sub={t('access_dash_recent_sub')} value={gov.added_30d} />

                        {gov.owners_complete ? (
                            <StatusRow icon={ShieldCheck} tone="green" title={t('access_dash_owners_ok')} sub={t('access_dash_owners_ok_sub')} value="✓" />
                        ) : (
                            <StatusRow
                                icon={AlertTriangle}
                                tone="amber"
                                title={t('access_dash_owners_missing')}
                                sub={t('access_dash_owners_missing_sub')}
                                value={gov.shares_without_owner + gov.groups_without_owner}
                            />
                        )}

                        {gov.resigned_holders > 0 ? (
                            <StatusRow
                                icon={UserCheck}
                                tone="red"
                                title={t('access_dash_resigned_bad')}
                                sub={t('access_dash_resigned_bad_sub')}
                                value={gov.resigned_holders}
                            />
                        ) : (
                            <StatusRow icon={UserCheck} tone="green" title={t('access_dash_resigned_ok')} sub={t('access_dash_resigned_ok_sub')} value="✓" />
                        )}
                    </div>
                </Card>
            </div>

            {/* Row 2: most-reached resources */}
            <Card className="overflow-hidden">
                <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                    <TrendingUp className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-semibold">{t('access_dash_top_title')}</span>
                </div>
                {data.top_resources.length === 0 ? (
                    <div className="text-muted-foreground py-12 text-center text-sm">{t('access_dash_empty')}</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-border border-b">
                                <th className="text-muted-foreground px-5 py-2.5 text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                    {t('access_name')}
                                </th>
                                <th className="text-muted-foreground px-5 py-2.5 text-left text-[11.5px] font-semibold tracking-wide uppercase">
                                    {t('access_dash_channel')}
                                </th>
                                <th className="text-muted-foreground px-5 py-2.5 text-right text-[11.5px] font-semibold tracking-wide uppercase">
                                    {t('access_dash_reach')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.top_resources.map((r, i) => {
                                const meta = CHANNEL[r.kind];
                                const Icon = meta.icon;
                                const width = `${(r.grants / (data.top_resources[0]?.grants || 1)) * 100}%`;
                                return (
                                    <tr
                                        key={`${r.kind}-${r.name}-${i}`}
                                        onClick={() => onOpenResource(r.kind, r.id)}
                                        className="border-border/60 hover:bg-muted/40 cursor-pointer border-b last:border-0"
                                    >
                                        <td className="px-5 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                {r.logo ? (
                                                    <img src={r.logo} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                                                ) : (
                                                    <span className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                                                        <Icon className="h-3.5 w-3.5" />
                                                    </span>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-medium">{r.name}</div>
                                                    {r.detail && (
                                                        <div className="text-muted-foreground max-w-[260px] truncate font-mono text-[11px]">{r.detail}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-2.5">
                                            <span className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold" style={tint(meta.color)}>
                                                {t(meta.labelKey)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-2.5">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="bg-secondary hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
                                                    <div className="bg-brand h-full rounded-full" style={{ width }} />
                                                </div>
                                                <span className="w-5 text-right font-mono font-semibold">{r.grants}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </Card>
        </div>
    );
}

/** Pulse skeleton mirroring the overview layout while the summary loads. */
function DashboardSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="p-5">
                        <div className="flex items-start justify-between">
                            <div className="bg-muted h-4 w-20 animate-pulse rounded" />
                            <div className="bg-muted h-9 w-9 animate-pulse rounded-lg" />
                        </div>
                        <div className="bg-muted mt-3 h-8 w-12 animate-pulse rounded" />
                        <div className="bg-muted mt-2 h-3 w-28 animate-pulse rounded" />
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                        <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                            <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                            <div className="bg-muted h-4 w-36 animate-pulse rounded" />
                        </div>
                        <div className="space-y-3.5 p-5">
                            {Array.from({ length: 4 }).map((_, r) => (
                                <div key={r} className="flex items-center gap-3">
                                    <div className="bg-muted h-3.5 w-24 shrink-0 animate-pulse rounded" />
                                    <div className="bg-muted h-2 flex-1 animate-pulse rounded-full" />
                                    <div className="bg-muted h-3.5 w-8 shrink-0 animate-pulse rounded" />
                                </div>
                            ))}
                        </div>
                    </Card>
                ))}
            </div>
            <Card className="overflow-hidden">
                <div className="border-border flex items-center gap-2 border-b px-5 py-3.5">
                    <div className="bg-muted h-4 w-4 animate-pulse rounded" />
                    <div className="bg-muted h-4 w-44 animate-pulse rounded" />
                </div>
                <div className="space-y-2 p-5">
                    {Array.from({ length: 5 }).map((_, r) => (
                        <div key={r} className="bg-muted h-9 w-full animate-pulse rounded" />
                    ))}
                </div>
            </Card>
        </div>
    );
}
