/**
 * Report Center list, as the design lays it out: reports grouped by module (in the design's
 * module order), each row linking to its report page and reading title + description, the
 * file formats it offers, the design's "Export ล่าสุด" column (the reader's latest kept file —
 * being built, failed, or when it was made, from "ไฟล์ Export ของฉัน"), and a star to pin it.
 */
import { useT } from '@/lang';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Box, FileText, Inbox, type LucideIcon, MonitorCog, Star, Users, Warehouse, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMyExports, useToggleReportPin } from '../hooks/use-reports';
import type { ReportDefinition, ReportDomain, ReportExportItem } from '../types';

/** The ticket overview report keeps its own dedicated page; every tabular report shares the generic one. */
export function reportRoute(def: Pick<ReportDefinition, 'key'>): string {
    return def.key === 'tickets.overview' ? '/reports/tickets-overview' : `/reports/r/${def.key}`;
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
                'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap',
                tone === 'blue' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
        >
            <i className="h-1.5 w-1.5 rounded-full bg-current" />
            {children}
        </span>
    );
}

/** The design's "Export ล่าสุด" column: the reader's latest kept file of this report. */
function LastExport({ item }: { item?: ReportExportItem }) {
    const t = useT();
    const lang = useUiStore((st) => st.lang);
    if (!item) return <span className="text-muted-foreground">{t('rep_last_export_none')}</span>;
    if (item.status === 'queued' || item.status === 'running') return <StatusPill tone="blue">{t('rep_last_export_building')}</StatusPill>;
    if (item.status === 'failed') return <StatusPill tone="red">{t('rep_last_export_failed')}</StatusPill>;
    return <>{t('rep_last_export_at').replace('{t}', relativeTime(item.finished_at ?? item.created_at, lang, ''))}</>;
}

/** Star toggle at the end of a report row — outside the row's link so it never navigates. */
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
            className="text-muted-foreground focus-visible:ring-brand/30 mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:text-amber-500 focus-visible:ring-2 focus-visible:outline-none"
        >
            <Star className={cn('h-4 w-4', report.pinned && 'fill-amber-400 text-amber-500')} />
        </button>
    );
}

export function ReportCatalogue({ reports }: { reports: ReportDefinition[] }) {
    const t = useT();
    const { data: exportsList = [] } = useMyExports();
    // Newest first from the API, so the first one seen per report is its latest.
    const latest = new Map<string, ReportExportItem>();
    for (const item of exportsList) if (!latest.has(item.report_key)) latest.set(item.report_key, item);
    const domains = [...new Set(reports.map((r) => r.domain))].sort(byDomainOrder);

    return (
        <div className="space-y-3.5">
            {domains.map((domain) => {
                const Icon = DOMAIN_ICONS[domain];
                const items = reports.filter((r) => r.domain === domain);
                return (
                    <Card key={domain} className="overflow-hidden">
                        <div className="bg-muted border-border flex items-center gap-2.5 border-b px-[18px] py-3">
                            <span className="bg-brand/10 text-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
                                <Icon className="h-[15px] w-[15px]" />
                            </span>
                            <span className="text-[13.5px] font-bold">{t(`rep_domain_${domain}`)}</span>
                            <span className="text-muted-foreground text-xs">{t('rep_count_reports').replace('{n}', String(items.length))}</span>
                        </div>
                        {items.map((r) => (
                            <div key={r.key} className="border-border hover:bg-accent flex items-center border-b transition-colors last:border-b-0">
                                <Link
                                    to={reportRoute(r)}
                                    className="focus-visible:ring-brand/30 grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 pl-[18px] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                                >
                                    <div className="min-w-0">
                                        <div className="font-semibold">{t(`rep_${reportStem(r.key)}_title`)}</div>
                                        <div className="text-muted-foreground mt-px text-[12.5px]">{t(`rep_${reportStem(r.key)}_desc`)}</div>
                                    </div>
                                    <div className="hidden gap-1 sm:flex">
                                        {r.formats.map((f) => (
                                            <FormatChip key={f} format={f} />
                                        ))}
                                    </div>
                                    <div className="text-muted-foreground min-w-[92px] text-right text-xs whitespace-nowrap">
                                        <LastExport item={latest.get(r.key)} />
                                    </div>
                                </Link>
                                <PinButton report={r} />
                            </div>
                        ))}
                    </Card>
                );
            })}
        </div>
    );
}
