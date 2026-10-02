/**
 * Report Center list, as the design lays it out: reports grouped by module (in the design's
 * module order), each row linking to its report page and reading title + description, the
 * file formats it offers (lined up beside the pin) with the reader's latest kept file under them
 * (being built, failed, or when it was made, from "ไฟล์ส่งออกของฉัน"), and a pin.
 */
import { useT } from '@/lang';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Box, FileText, Inbox, type LucideIcon, MonitorCog, Pin, Users, Warehouse, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMyExports, useToggleReportPin } from '../hooks/use-reports';
import type { ReportDefinition, ReportDomain, ReportExportItem, SnapshotRange } from '../types';
import { CARD_HEADING_TINT } from './card-heading';
import { periodRange } from './report-scope';

/**
 * A report's page address: its key with every "." and "_" made a "-" — "assets.by_status_department"
 * → "assets-by-status-department". Reversible because a domain ("assets", "tickets", …) never
 * holds a "-" or "_": the first "-" is the dot, the rest were underscores (reportKeyFromSlug).
 * The API keeps the dotted key (/api/reports/r/{key}); only the page URL reads plainly.
 */
export const reportSlug = (key: string) => key.replace('.', '-').replaceAll('_', '-');

export const reportKeyFromSlug = (slug: string) => slug.replace('-', '.').replaceAll('-', '_');

/**
 * Every report opens at /reports/<slug> (its page in pages/<slug>.tsx). With `range` (the hub's
 * period) the link carries ?from=&to= — but only for a report that has a date range
 * (`def.range`, from the catalogue): handing dates to one without would make it shed the query
 * and the address flicker.
 */
export function reportRoute(def: Pick<ReportDefinition, 'key'> & { range?: boolean }, range?: { from: string; to: string }): string {
    const path = `/reports/${reportSlug(def.key)}`;
    return range && def.range ? `${path}?${new URLSearchParams(range)}` : path;
}

const DOMAIN_ICONS: Record<ReportDomain, LucideIcon> = {
    tickets: Wrench,
    assets: Box,
    contracts: FileText,
    stock: Warehouse,
    requests: Inbox,
    employees: Users,
    access: MonitorCog,
};

/** i18n key stem per report: `rep_<stem>_title` / `rep_<stem>_desc`. */
export const reportStem = (key: string) => key.replace('.', '_');

/** The module order of the design's list and chips (the server's order groups by permission). */
export const DOMAIN_ORDER: ReportDomain[] = ['tickets', 'requests', 'assets', 'contracts', 'stock', 'employees', 'access'];

export const byDomainOrder = (a: ReportDomain, b: ReportDomain) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b);

function FormatChip({ format }: { format: string }) {
    const tone =
        format === 'xlsx'
            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30'
            : 'text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30';
    return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase ${tone}`}>{format}</span>;
}

function StatusPill({ tone, children }: { tone: 'blue' | 'red'; children: React.ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap',
                tone === 'blue' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
        >
            <i className="h-1.5 w-1.5 rounded-full bg-current" />
            {children}
        </span>
    );
}

/**
 * The reader's latest kept file of this report, under the row's format badges.
 * Nothing when there is none — a "no file yet" on every row says nothing a missing line does not.
 */
function LastExport({ item }: { item: ReportExportItem }) {
    const t = useT();
    const lang = useUiStore((st) => st.lang);
    if (item.status === 'queued' || item.status === 'running') return <StatusPill tone="blue">{t('rep_last_export_building')}</StatusPill>;
    if (item.status === 'failed') return <StatusPill tone="red">{t('rep_last_export_failed')}</StatusPill>;
    return <>{t('rep_last_export_at').replace('{t}', relativeTime(item.finished_at ?? item.created_at, lang, ''))}</>;
}

/** Pin toggle at the end of a report row — outside the row's link so it never navigates. */
function PinButton({ report }: { report: ReportDefinition }) {
    const t = useT();
    const toggle = useToggleReportPin();
    const label = report.pinned ? t('rep_unpin') : t('rep_pin');

    return (
        <button
            type="button"
            onClick={() => toggle.mutate({ key: report.key, pinned: !report.pinned })}
            aria-pressed={report.pinned}
            aria-label={label}
            title={label}
            className={cn(
                'focus-visible:ring-brand/30 hover:text-brand mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none',
                report.pinned ? 'text-brand' : 'text-muted-foreground/70',
            )}
        >
            {/* Pinned stands upright and filled; not pinned leans, outlined — the usual "pin" read. */}
            <Pin className={cn('h-4 w-4 transition-transform', report.pinned ? 'fill-current' : 'rotate-45')} />
        </button>
    );
}

function ReportRow({ report, latest, range }: { report: ReportDefinition; latest?: ReportExportItem; range?: SnapshotRange }) {
    const t = useT();

    return (
        <div className="border-border hover:bg-accent flex items-center border-b transition-colors last:border-b-0">
            <Link
                to={reportRoute(report, range && periodRange(range))}
                className="focus-visible:ring-brand/30 flex min-w-0 flex-1 items-center gap-4 py-3 pl-[18px] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
            >
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{t(`rep_${reportStem(report.key)}_title`)}</div>
                    <div className="text-muted-foreground mt-0.5 text-xs">{t(`rep_${reportStem(report.key)}_desc`)}</div>
                </div>
                {/* Beside the pin, right-aligned: the badges line up down every group, and the
                    latest file sits under them (nothing when there is none). */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="hidden gap-1 sm:flex">
                        {report.formats.map((f) => (
                            <FormatChip key={f} format={f} />
                        ))}
                    </div>
                    {latest && (
                        <div className="text-muted-foreground text-xs whitespace-nowrap">
                            <LastExport item={latest} />
                        </div>
                    )}
                </div>
            </Link>
            <PinButton report={report} />
        </div>
    );
}

/**
 * A module group: a tinted heading (icon, name, count) over its report rows. The tint is a
 * faint brand wash in light — muted gray matched the page ground and sank — and muted in dark.
 */
function GroupCard({ icon: Icon, title, count, children }: { icon: LucideIcon; title: string; count: number; children: React.ReactNode }) {
    const t = useT();

    return (
        <Card className="overflow-hidden">
            <div className={cn(CARD_HEADING_TINT, 'border-border flex items-center gap-2.5 border-b px-[18px] py-3')}>
                <span className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                    <Icon className="h-[15px] w-[15px]" />
                </span>
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-muted-foreground text-xs">{t('rep_count_reports').replace('{n}', String(count))}</span>
            </div>
            {children}
        </Card>
    );
}

/**
 * The catalogue while it loads, shaped like what replaces it — search box, module chips, then
 * group cards (tinted heading, report rows with title, description and format badges) — so the
 * page pulses in place instead of swapping a block for a list.
 */
export function ReportCatalogueSkeleton() {
    return (
        <div className="space-y-3.5" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <div className="flex flex-wrap gap-1.5">
                {['w-16', 'w-[72px]', 'w-[88px]', 'w-[76px]', 'w-[92px]', 'w-[68px]'].map((w, i) => (
                    <Skeleton key={i} className={cn('h-8 rounded-full', w)} />
                ))}
            </div>
            {[4, 3].map((rows, g) => (
                <Card key={g} className="overflow-hidden">
                    <div className={cn(CARD_HEADING_TINT, 'border-border flex items-center gap-2.5 border-b px-[18px] py-3')}>
                        <Skeleton className="bg-muted dark:bg-background/70 h-7 w-7" />
                        <Skeleton className="bg-muted dark:bg-background/70 h-4 w-28" />
                        <Skeleton className="bg-muted dark:bg-background/70 h-3 w-14" />
                    </div>
                    {Array.from({ length: rows }, (_, i) => (
                        <div key={i} className="border-border flex items-center gap-4 border-b py-3 pr-4 pl-[18px] last:border-b-0">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-2/5" />
                                <Skeleton className="h-3 w-3/4" />
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <Skeleton className="h-5 w-11" />
                                <Skeleton className="h-5 w-9" />
                            </div>
                            <Skeleton className="h-6 w-6 shrink-0" />
                        </div>
                    ))}
                </Card>
            ))}
        </div>
    );
}

/** Pinned first, in the order they were pinned; the rest keep the catalogue's order. */
const pinnedFirst = (a: ReportDefinition, b: ReportDefinition) => (a.pin_order ?? Infinity) - (b.pin_order ?? Infinity);

/**
 * `showPinned` puts the "ปักหมุดไว้" card on top (the hub's unfiltered view) — quick access in
 * the order the reader pinned things, as Drive or a Start menu does. Pinned reports stay in
 * their module group as well, listed first there.
 */
export function ReportCatalogue({
    reports,
    showPinned = false,
    range,
}: {
    reports: ReportDefinition[];
    showPinned?: boolean;
    /** The hub's period switch — each report link opens on its dates. */
    range?: SnapshotRange;
}) {
    const t = useT();
    const { data: exportsList = [] } = useMyExports();
    // Newest first from the API, so the first one seen per report is its latest.
    const latest = new Map<string, ReportExportItem>();
    for (const item of exportsList) if (!latest.has(item.report_key)) latest.set(item.report_key, item);
    const domains = [...new Set(reports.map((r) => r.domain))].sort(byDomainOrder);
    const pinned = reports.filter((r) => r.pinned).sort(pinnedFirst);

    return (
        <div className="space-y-3.5">
            {showPinned && pinned.length > 0 && (
                <GroupCard icon={Pin} title={t('rep_pinned_title')} count={pinned.length}>
                    {pinned.map((r) => (
                        <ReportRow key={r.key} report={r} latest={latest.get(r.key)} range={range} />
                    ))}
                </GroupCard>
            )}
            {domains.map((domain) => {
                const items = reports.filter((r) => r.domain === domain).sort(pinnedFirst);
                return (
                    <GroupCard key={domain} icon={DOMAIN_ICONS[domain]} title={t(`rep_domain_${domain}`)} count={items.length}>
                        {items.map((r) => (
                            <ReportRow key={r.key} report={r} latest={latest.get(r.key)} range={range} />
                        ))}
                    </GroupCard>
                );
            })}
        </div>
    );
}
