/**
 * Report Center list: reports grouped by module, each row linking to its report page with a
 * star to pin it, and — as in the design's "Export ล่าสุด" column — how the reader's latest
 * file of it went (being built, failed, or when it was made), from "ไฟล์ Export ของฉัน".
 * Every report offers both Excel and PDF, so the row no longer spends room saying so.
 */
import { useT } from '@/lang';
import { relativeTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { Box, ChevronRight, FileText, Inbox, type LucideIcon, MonitorCog, Star, Users, Warehouse, Wrench } from 'lucide-react';
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

/** The reader's latest file of this report, if it is still kept. */
function LastExport({ item }: { item?: ReportExportItem }) {
    const t = useT();
    const lang = useUiStore((st) => st.lang);
    if (!item) return null;
    if (item.status === 'queued' || item.status === 'running') {
        return (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
                {t('rep_last_export_building')}
            </span>
        );
    }
    if (item.status === 'failed') {
        return (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                {t('rep_last_export_failed')}
            </span>
        );
    }
    return (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
            {t('rep_last_export_at').replace('{t}', relativeTime(item.finished_at ?? item.created_at, lang, ''))}
        </span>
    );
}

/** Star toggle in front of a report row — sits outside the row's link so it never navigates. */
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
            className="text-muted-foreground hover:text-brand focus-visible:ring-brand/30 m-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
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
    const domains = [...new Set(reports.map((r) => r.domain))];

    return (
        <div className="space-y-4">
            {domains.map((domain) => {
                const Icon = DOMAIN_ICONS[domain];
                const items = reports.filter((r) => r.domain === domain);
                return (
                    <Card key={domain} className="overflow-hidden">
                        <div className="bg-muted border-border flex items-center gap-2.5 border-b px-5 py-3">
                            <span className="bg-brand/10 text-brand flex h-7 w-7 items-center justify-center rounded-md">
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="font-semibold">{t(`rep_domain_${domain}`)}</span>
                            <span className="text-muted-foreground text-xs">{t('rep_count_reports').replace('{n}', String(items.length))}</span>
                        </div>
                        {items.map((r) => (
                            <div key={r.key} className="border-border hover:bg-accent flex items-center border-b last:border-b-0">
                                <PinButton report={r} />
                                <Link to={reportRoute(r)} className="flex min-w-0 flex-1 items-center gap-4 py-3 pr-5">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold">{t(`rep_${reportStem(r.key)}_title`)}</div>
                                        <div className="text-muted-foreground text-sm">{t(`rep_${reportStem(r.key)}_desc`)}</div>
                                    </div>
                                    <div className="hidden sm:block">
                                        <LastExport item={latest.get(r.key)} />
                                    </div>
                                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                                </Link>
                            </div>
                        ))}
                    </Card>
                );
            })}
        </div>
    );
}
