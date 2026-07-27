import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { AccessIssueItem, AccessKind, AccessSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
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
import { useState } from 'react';
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
 * ink = neutral information. With `onClick` the row becomes a button (hover +
 * chevron) that opens the issue drill-down.
 */
function StatusRow({
    icon: Icon,
    tone,
    title,
    sub,
    value,
    onClick,
}: {
    icon: LucideIcon;
    tone: 'amber' | 'red' | 'green' | 'ink';
    title: string;
    sub: string;
    value: string | number;
    onClick?: () => void;
}) {
    const toneClass = {
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-destructive',
        green: 'text-emerald-600 dark:text-emerald-400',
        ink: 'text-muted-foreground',
    }[tone];
    // Alert rows (amber/red) get a soft tinted background + a count pill so they
    // stand out from the all-clear rows; same paddings, so the card height is unchanged.
    const isAlert = tone === 'amber' || tone === 'red';
    const rowTint = {
        amber: 'bg-amber-500/[0.07] hover:bg-amber-500/15',
        red: 'bg-destructive/[0.06] hover:bg-destructive/10',
        green: '',
        ink: '',
    }[tone];
    const body = (
        <>
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass)} />
            <div className="min-w-0 flex-1 text-left">
                <div className="text-sm font-medium">{title}</div>
                <div className="text-muted-foreground text-xs">{sub}</div>
            </div>
            {isAlert ? (
                <span
                    className={cn(
                        'rounded-full px-2 py-px font-mono text-xs font-bold',
                        tone === 'red' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
                    )}
                >
                    {value}
                </span>
            ) : (
                <span className={cn('font-mono text-sm font-semibold', toneClass)}>{value}</span>
            )}
            {onClick && <ChevronRight className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />}
        </>
    );
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn('flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors', rowTint || 'hover:bg-muted/40')}
            >
                {body}
            </button>
        );
    }
    return <div className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', rowTint)}>{body}</div>;
}

/** One severity-grouped section inside the issues drawer. Hidden when it has no rows. */
function IssueSection({
    tone,
    icon: Icon,
    title,
    hint,
    items,
    onPick,
    t,
}: {
    tone: 'red' | 'amber';
    icon: LucideIcon;
    title: string;
    /** Problem line under each row when the item has no holder (resigned rows name the holder instead). */
    hint: string;
    items: (AccessIssueItem & { employee?: string | null })[];
    onPick: (kind: AccessKind, id: number) => void;
    t: (k: string) => string;
}) {
    if (items.length === 0) return null;
    const toneText = tone === 'red' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400';
    const toneRail = tone === 'red' ? 'border-l-destructive' : 'border-l-amber-500';
    const tonePill = tone === 'red' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
    return (
        // The left rail carries the severity — red = act now, amber = needs a look.
        <div className={cn('border-border rounded-lg border border-l-2', toneRail)}>
            <div className="border-border/60 flex items-center gap-2 border-b px-3.5 py-2.5">
                <Icon className={cn('h-4 w-4 shrink-0', toneText)} />
                <span className="text-sm font-semibold">{title}</span>
                <span className={cn('ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-bold', tonePill)}>{items.length}</span>
            </div>
            <div className="divide-border/60 divide-y p-1.5">
                {items.map((item, i) => {
                    const meta = CHANNEL[item.kind];
                    const ChannelIcon = meta.icon;
                    return (
                        <button
                            key={`${item.kind}-${item.id}-${i}`}
                            type="button"
                            onClick={() => onPick(item.kind, item.id)}
                            className="hover:bg-muted/40 flex w-full items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={tint(meta.color)}>
                                <ChannelIcon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="truncate text-sm font-medium">{item.name ?? '—'}</span>
                                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={tint(meta.color)}>
                                        {t(meta.labelKey)}
                                    </span>
                                </div>
                                <div className={cn('text-xs', item.employee ? toneText : 'text-muted-foreground')}>
                                    {item.employee ? `${t('access_dash_issue_holder')} ${item.employee}` : hint}
                                </div>
                            </div>
                            <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Governance triage drawer: every anomaly across the four registries in one
 * place, grouped by severity (resigned holders first). Clicking a row closes
 * the drawer and opens that resource's manage drawer.
 */
function IssuesDrawer({
    open,
    governance,
    onClose,
    onOpenResource,
    t,
}: {
    open: boolean;
    governance: AccessSummary['governance'];
    onClose: () => void;
    onOpenResource: (kind: AccessKind, id: number) => void;
    t: (k: string) => string;
}) {
    const { issues } = governance;
    const total = issues.resigned.length + issues.no_owner.length + issues.empty.length;
    const pick = (kind: AccessKind, id: number) => {
        onClose();
        onOpenResource(kind, id);
    };
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <ShieldCheck className="text-muted-foreground h-5 w-5" />
                        {t('access_issues_title')}
                        <span className="bg-brand/10 text-brand ml-1 rounded-full px-2.5 py-0.5 font-mono text-xs font-bold">
                            {total} {t('access_issues_total')}
                        </span>
                    </SheetTitle>
                    <SheetDescription>{t('access_issues_sub')}</SheetDescription>
                </SheetHeader>

                <div className="mt-5 flex-1 space-y-3.5 overflow-y-auto px-1">
                    {total === 0 ? (
                        <div className="flex flex-col items-center gap-1.5 py-16 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <div className="text-sm font-semibold">{t('access_issues_clear')}</div>
                            <div className="text-muted-foreground text-xs">{t('access_issues_clear_sub')}</div>
                        </div>
                    ) : (
                        <>
                            <IssueSection
                                tone="red"
                                icon={UserCheck}
                                title={t('access_dash_resigned_bad')}
                                hint=""
                                items={issues.resigned}
                                onPick={pick}
                                t={t}
                            />
                            <IssueSection
                                tone="amber"
                                icon={ShieldCheck}
                                title={t('access_dash_owners_missing')}
                                hint={t('access_issue_no_owner_hint')}
                                items={issues.no_owner}
                                onPick={pick}
                                t={t}
                            />
                            <IssueSection
                                tone="amber"
                                icon={AlertTriangle}
                                title={t('access_dash_empty_shares')}
                                hint={t('access_issue_empty_hint')}
                                items={issues.empty}
                                onPick={pick}
                                t={t}
                            />
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
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
    // Whether the governance triage drawer is open (every issue group in one panel).
    const [issuesOpen, setIssuesOpen] = useState(false);

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

                {/* Governance status — rows render by severity: act (red) → review (amber) → info → all-clear. */}
                <Card className="overflow-hidden">
                    <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-muted-foreground h-4 w-4" />
                            <span className="text-sm font-semibold">{t('access_dash_governance_title')}</span>
                        </div>
                        <span className="text-muted-foreground flex items-center gap-2 text-xs">
                            {(gov.resigned_holders > 0 || gov.empty_resources > 0 || !gov.owners_complete) && (
                                // Blinking dot = something below needs attention (red beats amber).
                                <span className="relative flex h-2 w-2">
                                    <span
                                        className={cn(
                                            'absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:hidden',
                                            gov.resigned_holders > 0 ? 'bg-destructive/60' : 'bg-amber-500/60',
                                        )}
                                    />
                                    <span
                                        className={cn(
                                            'relative inline-flex h-2 w-2 rounded-full',
                                            gov.resigned_holders > 0 ? 'bg-destructive' : 'bg-amber-500',
                                        )}
                                    />
                                </span>
                            )}
                            {t('access_dash_latest')}
                        </span>
                    </div>
                    <div className="divide-border/60 divide-y p-2">
                        {[
                            gov.resigned_holders > 0
                                ? {
                                      rank: 0,
                                      node: (
                                          <StatusRow
                                              key="resigned"
                                              icon={UserCheck}
                                              tone="red"
                                              title={t('access_dash_resigned_bad')}
                                              sub={t('access_dash_resigned_bad_sub')}
                                              value={gov.resigned_holders}
                                              onClick={() => setIssuesOpen(true)}
                                          />
                                      ),
                                  }
                                : {
                                      rank: 3,
                                      node: (
                                          <StatusRow
                                              key="resigned"
                                              icon={UserCheck}
                                              tone="green"
                                              title={t('access_dash_resigned_ok')}
                                              sub={t('access_dash_resigned_ok_sub')}
                                              value="✓"
                                          />
                                      ),
                                  },
                            gov.empty_resources > 0
                                ? {
                                      rank: 1,
                                      node: (
                                          <StatusRow
                                              key="empty"
                                              icon={AlertTriangle}
                                              tone="amber"
                                              title={t('access_dash_empty_shares')}
                                              sub={`“${gov.empty_sample ?? ''}” ${t('access_dash_no_access_yet')}`}
                                              value={gov.empty_resources}
                                              onClick={() => setIssuesOpen(true)}
                                          />
                                      ),
                                  }
                                : {
                                      rank: 3,
                                      node: (
                                          <StatusRow
                                              key="empty"
                                              icon={CheckCircle2}
                                              tone="green"
                                              title={t('access_dash_shares_ok')}
                                              sub={t('access_dash_shares_ok_sub')}
                                              value="✓"
                                          />
                                      ),
                                  },
                            gov.owners_complete
                                ? {
                                      rank: 3,
                                      node: (
                                          <StatusRow
                                              key="owners"
                                              icon={ShieldCheck}
                                              tone="green"
                                              title={t('access_dash_owners_ok')}
                                              sub={t('access_dash_owners_ok_sub')}
                                              value="✓"
                                          />
                                      ),
                                  }
                                : {
                                      rank: 1,
                                      node: (
                                          <StatusRow
                                              key="owners"
                                              icon={AlertTriangle}
                                              tone="amber"
                                              title={t('access_dash_owners_missing')}
                                              sub={t('access_dash_owners_missing_sub')}
                                              value={gov.no_owner}
                                              onClick={() => setIssuesOpen(true)}
                                          />
                                      ),
                                  },
                            {
                                rank: 2,
                                node: (
                                    <StatusRow
                                        key="recent"
                                        icon={TrendingUp}
                                        tone="ink"
                                        title={t('access_dash_recent_title')}
                                        sub={t('access_dash_recent_sub')}
                                        value={gov.added_30d}
                                    />
                                ),
                            },
                        ]
                            .sort((a, b) => a.rank - b.rank)
                            .map((r) => r.node)}
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

            {/* Triage drawer behind the governance rows — item click jumps to the resource drawer. */}
            <IssuesDrawer open={issuesOpen} governance={gov} onClose={() => setIssuesOpen(false)} onOpenResource={onOpenResource} t={t} />
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
