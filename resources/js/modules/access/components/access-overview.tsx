import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { OverviewHeader, useOverviewPeriod, usePeriodWords, useShownPeriod } from '@/shared/components/overview-period';
import { StatCard } from '@/shared/components/stat-card';
import { StatusBadge } from '@/shared/components/status-badge';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { rowDelay } from '@/shared/lib/row-in';
import { CARD_HEADING, TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { AccessIssueItem, AccessKind, AccessSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    Folder,
    Globe,
    LayoutGrid,
    type LucideIcon,
    Package,
    ShieldAlert,
    ShieldCheck,
    TrendingUp,
    UserCheck,
    UserMinus,
    Users,
} from 'lucide-react';
import { useState } from 'react';
import { useAccessSummary, useRevokeGrant } from '../hooks/use-access';

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
        amber: 'text-amber-700 dark:text-amber-400',
        red: 'text-destructive',
        green: 'text-emerald-700 dark:text-emerald-400',
        ink: 'text-muted-foreground',
    }[tone];
    // Alert rows (amber/red) get a soft tinted background + a count pill so they
    // stand out from the all-clear rows; same paddings, so the card height is unchanged.
    const isAlert = tone === 'amber' || tone === 'red';
    const rowTint = {
        amber: 'bg-amber-500/[0.05] hover:bg-amber-500/10',
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
                        'rounded-full px-2 py-px text-xs font-bold',
                        tone === 'red'
                            ? 'bg-destructive/10 dark:text-destructive text-red-700'
                            : 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
                    )}
                >
                    {value}
                </span>
            ) : (
                <span className={cn('text-sm font-semibold', toneClass)}>{value}</span>
            )}
            {onClick && <ChevronRight className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />}
        </>
    );
    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={cn(
                    'focus-visible:ring-ring flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
                    rowTint || 'hover:bg-muted/40',
                )}
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
    onRevoke,
    canEdit,
    t,
}: {
    tone: 'red' | 'amber';
    icon: LucideIcon;
    title: string;
    /** Problem line under each row when the item has no holder (resigned rows name the holder instead). */
    hint: string;
    items: (AccessIssueItem & { employee?: string | null; reason?: 'resigned' | 'none'; membership_id?: number })[];
    onPick: (kind: AccessKind, id: number) => void;
    /** Clear the row without leaving the drawer. Absent when the remedy is not a one-click one
     *  (finding a new owner) or when the viewer cannot edit that registry. */
    onRevoke?: (item: AccessIssueItem & { employee?: string | null; membership_id?: number }) => void;
    /** Per-registry edit permission — a row the viewer cannot edit shows no action. */
    canEdit?: Record<AccessKind, boolean>;
    t: (k: string) => string;
}) {
    const lang = useUiStore((s) => s.lang);
    const fmtN = useNumberFormat();
    if (items.length === 0) return null;
    const toneText = tone === 'red' ? 'text-destructive' : 'text-amber-700 dark:text-amber-400';
    const toneRail = tone === 'red' ? 'border-l-destructive' : 'border-l-amber-500';
    return (
        // Severity is carried by the rail and the header icon together — one treatment, read
        // as a unit. The count badge stays neutral: how many is information, not a warning.
        <div className={cn('border-border overflow-clip rounded-lg border border-l-2', toneRail)}>
            <div className={cn(CARD_HEADING, 'border-border/60 flex items-center gap-2 border-b px-3.5 py-2.5')}>
                <Icon className={cn('h-4 w-4 shrink-0', toneText)} />
                <span className="text-sm font-semibold">{title}</span>
                <span className="bg-muted text-muted-foreground ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold">{fmtN(items.length)}</span>
            </div>
            <div className="divide-border/60 divide-y p-1.5">
                {items.map((item, i) => {
                    const meta = CHANNEL[item.kind];
                    const ChannelIcon = meta.icon;
                    return (
                        // A row is two controls, not one: open the resource, or clear the grant
                        // here. Nesting the second button inside the first would be invalid, so
                        // the hover tint moves to the wrapper and both children sit inside it.
                        <div
                            key={`${item.kind}-${item.id}-${i}`}
                            className="hover:bg-muted/40 flex w-full items-center gap-1 rounded-md pr-1.5 transition-colors"
                        >
                            <button
                                type="button"
                                onClick={() => onPick(item.kind, item.id)}
                                className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-hidden"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={tint(meta.color)}>
                                    <ChannelIcon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    {/* No type pill beside the name: the tinted icon on the left already
                                        says which registry this is, in the same colour, and the pill was
                                        eating the width that long resource names need. */}
                                    <div className="truncate text-sm font-medium">{item.name ?? '—'}</div>
                                    {/* The reason line stays neutral in every section — severity is the
                                        rail's job, and a coloured reason used to be keyed to whether a
                                        person's name happened to come with the row, which meant an
                                        ownerless resource would render grey inside a red section.
                                        Emphasis goes on the name instead, where the eye needs it. */}
                                    <div className="text-muted-foreground mt-0.5 truncate text-xs">
                                        {item.employee ? (
                                            <>
                                                {t(item.reason === 'resigned' ? 'access_dash_issue_owner' : 'access_dash_issue_holder')}{' '}
                                                <span className="text-foreground font-medium">
                                                    {localPair(item.employee, item.employee_th, lang)}
                                                </span>
                                            </>
                                        ) : (
                                            hint
                                        )}
                                    </div>
                                </div>
                                <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                            </button>
                            {onRevoke && item.membership_id != null && canEdit?.[item.kind] && (
                                <button
                                    type="button"
                                    onClick={() => onRevoke(item)}
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-hidden"
                                >
                                    {t('access_issue_revoke')}
                                </button>
                            )}
                        </div>
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
    canEdit,
    onClose,
    onOpenResource,
    t,
}: {
    open: boolean;
    governance: AccessSummary['governance'];
    /** Per-registry edit permission — the same gate the revoke endpoint enforces server-side. */
    canEdit: Record<AccessKind, boolean>;
    onClose: () => void;
    onOpenResource: (kind: AccessKind, id: number) => void;
    t: (k: string) => string;
}) {
    const { issues } = governance;
    const lang = useUiStore((s) => s.lang);
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const revoke = useRevokeGrant();
    const total = issues.resigned.length + issues.no_owner.length + issues.empty.length;
    const pick = (kind: AccessKind, id: number) => {
        onClose();
        onOpenResource(kind, id);
    };

    // Clearing a grant is destructive, so it confirms with the person's name first — the same
    // flow the members drawer uses. The default danger copy is overridden because it is not
    // true here: nothing is deleted and nothing is permanent — the grant is soft-revoked and
    // the person can be added back from the resource. The queue stays open afterwards, so a
    // run of leftovers can be worked down without leaving.
    const askRevoke = (item: AccessIssueItem & { employee?: string | null; membership_id?: number }) =>
        confirm({
            variant: 'danger',
            icon: UserMinus,
            title: t('access_revoke_confirm_title'),
            description: t('access_revoke_confirm_desc'),
            confirmText: t('access_issue_revoke'),
            entity: { name: localPair(item.employee, item.employee_th, lang) ?? '—', sub: item.name ?? undefined },
            action: async () => {
                await revoke.mutateAsync({ kind: item.kind, id: item.id, membershipId: item.membership_id as number });
                useToastStore.getState().push(t('access_member_removed'), 'error', undefined, 'users', { duration: 4000, polite: true });
            },
        });
    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <ShieldCheck className="text-muted-foreground h-5 w-5" />
                        {t('access_issues_title')}
                        <span className="bg-brand/10 text-brand ml-1 rounded-full px-2.5 py-0.5 text-xs font-bold">
                            {fmtN(total)} {t('access_issues_total')}
                        </span>
                    </SheetTitle>
                    <SheetDescription>{t('access_issues_sub')}</SheetDescription>
                </SheetHeader>

                <div className="mt-5 flex-1 space-y-3.5 overflow-y-auto px-1">
                    {total === 0 ? (
                        <EmptyState kind="clear" title={t('access_empty_overview_issues')} hint={t('access_empty_overview_issues_hint')} />
                    ) : (
                        <>
                            {/* Only the grant queue gets an in-place action: revoking is one
                                click with nothing to choose. Finding a new owner is not, so
                                those rows still send you to the resource. */}
                            <IssueSection
                                tone="red"
                                icon={UserCheck}
                                title={t('access_dash_resigned_bad')}
                                hint=""
                                items={issues.resigned}
                                onPick={pick}
                                onRevoke={askRevoke}
                                canEdit={canEdit}
                                t={t}
                            />
                            <IssueSection
                                tone="red"
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
export function AccessOverview({
    onOpenTab,
    onOpenResource,
    canEdit,
}: {
    onOpenTab: (kind: AccessKind) => void;
    /** Open a specific resource: switch to its tab and open its manage drawer. */
    onOpenResource: (kind: AccessKind, id: number) => void;
    /** Per-registry edit permission, so the triage drawer only offers an action the API will accept. */
    canEdit: Record<AccessKind, boolean>;
}) {
    const lang = useUiStore((s) => s.lang);
    const t = useT();
    const fmtN = useNumberFormat();
    const [period, setPeriod] = useOverviewPeriod();
    const { data, isLoading, isError, isPlaceholderData, refetch } = useAccessSummary(period);
    const shownPeriod = useShownPeriod(period, isPlaceholderData);
    const periodWords = usePeriodWords();
    // Whether the governance triage drawer is open (every issue group in one panel).
    const [issuesOpen, setIssuesOpen] = useState(false);

    const header = <OverviewHeader value={period} onChange={setPeriod} />;
    if (isError && !data) {
        return (
            <div className="space-y-4">
                {header}
                <LoadFailedPanel onRetry={() => refetch()} />
            </div>
        );
    }
    if (isLoading || !data) {
        return (
            <div className="space-y-4">
                {header}
                <OverviewSkeleton />
            </div>
        );
    }

    const total = data.total_grants || 0;
    const maxGrants = Math.max(1, ...CHANNELS.map((c) => data.channels[c.key].grants));
    const gov = data.governance;

    return (
        <div className="space-y-4 tabular-nums">
            {header}
            {/* KPI row — one card per channel (count + the period's net change) */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {CHANNELS.map(({ key, kind }) => {
                    const stat = data.channels[key];
                    const meta = CHANNEL[kind];
                    const Icon = meta.icon;
                    // The period's signed change drives the delta line's arrow, wording and colour.
                    const net = stat.net_in_period;
                    const deltaTone = net > 0 ? 'text-emerald-700 dark:text-emerald-400' : net < 0 ? 'text-destructive' : 'text-muted-foreground';
                    const deltaKey = net > 0 ? 'access_dash_up' : net < 0 ? 'access_dash_down' : 'access_dash_flat';
                    return (
                        <StatCard
                            key={kind}
                            label={t(meta.labelKey)}
                            icon={Icon}
                            value={stat.resources}
                            onClick={() => onOpenTab(kind)}
                            footer={
                                <span className={deltaTone}>
                                    {t(deltaKey)
                                        .replace('{n}', fmtN(Math.abs(net)))
                                        .replace('{period}', periodWords.within(shownPeriod))}
                                </span>
                            }
                        />
                    );
                })}
            </div>

            {/* Row 1: distribution + governance */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Access share */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-5 py-3.5')}>
                        <div className="flex items-center gap-2">
                            <LayoutGrid className="text-muted-foreground h-4 w-4" />
                            <span className="text-sm font-semibold">{t('access_dash_distribution_title')}</span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                            <b className="text-foreground font-bold">{formatNumber(total, lang)}</b> {t('access_dash_grants_total')}
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
                                    <span className="w-16 shrink-0 text-right text-sm font-semibold whitespace-nowrap">
                                        {fmtN(grants)} <span className="text-muted-foreground text-[11px] font-medium">{pct}%</span>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Governance status — rows render by severity: act (red) → review (amber) → info → all-clear. */}
                <Card className="overflow-hidden">
                    <div className={cn(CARD_HEADING, 'border-border flex items-center justify-between border-b px-5 py-3.5')}>
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-muted-foreground h-4 w-4" />
                            <span className="text-sm font-semibold">{t('access_dash_governance_title')}</span>
                        </div>
                        <span className="text-muted-foreground flex items-center gap-2 text-xs">
                            {(gov.resigned_holders > 0 || gov.empty_resources > 0 || !gov.owners_complete) && (
                                // Blinking dot = something below needs attention (red beats amber), same blink as header alerts
                                <span
                                    className={cn(
                                        'alert-blink inline-flex h-2 w-2 rounded-full',
                                        gov.resigned_holders > 0 ? 'bg-destructive' : 'bg-amber-500',
                                    )}
                                />
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
                                              icon={ShieldAlert}
                                              tone="red"
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
                                        value={gov.added_in_period}
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
                <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                    <TrendingUp className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-semibold">{t('access_dash_top_title')}</span>
                </div>
                {data.top_resources.length === 0 ? (
                    <EmptyState kind="empty" title={t('access_empty_overview_top_resources')} hint={t('access_empty_overview_top_resources_hint')} />
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className={cn(TABLE_HEAD, 'border-border border-b')}>
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
                                        key={`${r.kind}-${r.id}`}
                                        onClick={() => onOpenResource(r.kind, r.id)}
                                        className="row-in row-hover border-border/60 cursor-pointer border-b last:border-0"
                                        style={rowDelay(i)}
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
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenResource(r.kind, r.id);
                                                        }}
                                                        className="focus-visible:ring-ring rounded-sm text-left font-medium hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
                                                    >
                                                        {r.name}
                                                    </button>
                                                    {r.detail && (
                                                        <div className="text-muted-foreground max-w-[260px] truncate text-[11px]">{r.detail}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-2.5">
                                            <StatusBadge color={meta.color} dot={false}>
                                                {t(meta.labelKey)}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-5 py-2.5">
                                            <div className="flex items-center justify-end gap-3">
                                                <div className="bg-secondary hidden h-1.5 w-24 overflow-hidden rounded-full sm:block">
                                                    <div className="bg-brand h-full rounded-full" style={{ width }} />
                                                </div>
                                                <span className="w-5 text-right font-semibold">{fmtN(r.grants)}</span>
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
            <IssuesDrawer
                open={issuesOpen}
                governance={gov}
                canEdit={canEdit}
                onClose={() => setIssuesOpen(false)}
                onOpenResource={onOpenResource}
                t={t}
            />
        </div>
    );
}

/** Pulse skeleton mirroring the overview layout while the summary loads. */
function OverviewSkeleton() {
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
                        <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
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
                <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
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
