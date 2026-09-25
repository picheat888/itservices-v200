/**
 * Report Center page (/reports) — lists the reports this user may open, with search and
 * module chips. Server decides visibility (GET /api/reports → ReportCatalogue).
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { LineChart, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ReportCatalogue, reportStem } from '../components/report-catalogue';
import { useReportCatalogue } from '../hooks/use-reports';
import type { ReportDomain } from '../types';

export default function ReportsPage() {
    const t = useT();
    const { data: reports = [], isLoading } = useReportCatalogue();
    const [query, setQuery] = useState('');
    const [domain, setDomain] = useState<ReportDomain | 'all'>('all');

    const domains = [...new Set(reports.map((r) => r.domain))];
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return reports.filter((r) => {
            if (domain !== 'all' && r.domain !== domain) return false;
            if (!q) return true;
            const stem = reportStem(r.key);
            return `${t(`rep_${stem}_title`)} ${t(`rep_${stem}_desc`)}`.toLowerCase().includes(q);
        });
    }, [reports, query, domain, t]);

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold">{t('rep_center_title')}</h1>
                <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{t('rep_center_sub')}</p>
            </div>

            {isLoading ? (
                <Skeleton className="h-40 w-full" />
            ) : reports.length === 0 ? (
                <div className="border-border flex flex-col items-center rounded-xl border border-dashed py-16 text-center">
                    <LineChart className="text-muted-foreground h-10 w-10" />
                    <div className="mt-3 font-medium">{t('rep_empty_title')}</div>
                    <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t('rep_empty_sub')}</p>
                </div>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative w-full max-w-sm">
                            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                            <Input id="report-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('rep_search_placeholder')} className="pl-9" />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {(['all', ...domains] as const).map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => setDomain(d)}
                                    className={cn(
                                        'h-8 rounded-full border px-3 text-xs font-semibold',
                                        domain === d ? 'bg-brand border-brand text-brand-foreground' : 'border-border text-muted-foreground bg-background',
                                    )}
                                >
                                    {d === 'all' ? t('rep_filter_all') : t(`rep_domain_${d}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    {visible.length === 0 ? (
                        <div className="text-muted-foreground py-10 text-center text-sm">{t('rep_no_match')}</div>
                    ) : (
                        <ReportCatalogue reports={visible} />
                    )}
                </>
            )}
        </div>
    );
}
