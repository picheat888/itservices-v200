/**
 * Report Center list: reports grouped by module, each row linking to its report page and
 * showing the export formats it offers. Mirrors the "ศูนย์รายงาน" screen of the design.
 */
import { useT } from '@/lang';
import { Card } from '@/shared/ui/card';
import { ChevronRight, type LucideIcon, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReportDefinition, ReportDomain, ReportKey } from '../types';

export const REPORT_ROUTES: Record<ReportKey, string> = {
    'tickets.overview': '/reports/tickets-overview',
};

const DOMAIN_ICONS: Record<ReportDomain, LucideIcon> = { tickets: Wrench };

/** i18n key stem per report: `rep_<stem>_title` / `rep_<stem>_desc`. */
export const reportStem = (key: ReportKey) => key.replace('.', '_');

function FormatChip({ format }: { format: string }) {
    const tone = format === 'xlsx' ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600/30 dark:border-emerald-400/30' : 'text-red-600 dark:text-red-400 border-red-600/30 dark:border-red-400/30';
    return <span className={`rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase ${tone}`}>{format}</span>;
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
                            <Link
                                key={r.key}
                                to={REPORT_ROUTES[r.key]}
                                className="border-border hover:bg-accent flex items-center gap-4 border-b px-5 py-3 last:border-b-0"
                            >
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
                        ))}
                    </Card>
                );
            })}
        </div>
    );
}
