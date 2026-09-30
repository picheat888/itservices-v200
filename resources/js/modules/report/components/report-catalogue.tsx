/**
 * Report Center list: reports grouped by module, each row linking to its report page and
 * showing the export formats it offers, with a star to pin it. Mirrors the "ศูนย์รายงาน" screen of the design.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { Box, ChevronRight, FileText, Inbox, type LucideIcon, MonitorCog, Star, Users, Warehouse, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToggleReportPin } from '../hooks/use-reports';
import type { ReportDefinition, ReportDomain } from '../types';

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

function FormatChip({ format }: { format: string }) {
    const tone = format === 'xlsx' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30' : 'text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30';
    return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase ${tone}`}>{format}</span>;
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
                                    <div className="hidden gap-1 sm:flex">
                                        {r.formats.map((f) => (
                                            <FormatChip key={f} format={f} />
                                        ))}
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
