/**
 * Report Center page (/reports) — heading with the period control (PeriodSwitch), the number
 * strip (SnapshotStrip), then two columns as in the design: the reports this user may open
 * (search, module chips, a "pinned" chip) on the left, and a rail with their queued files
 * (MyExports — "ไฟล์ Export ของฉัน") and scheduled report emails (ScheduledReports) on the
 * right. Below xl the rail follows the reports.
 * Server decides visibility (GET /api/reports → ReportCatalogue) and remembers pins.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { LineChart, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MyExports } from '../components/my-exports';
import { byDomainOrder, ReportCatalogue, reportStem } from '../components/report-catalogue';
import { ScheduledReports } from '../components/scheduled-reports';
import { PeriodSwitch, SnapshotStrip, useSnapshotPeriod } from '../components/snapshot-strip';
import { useReportCatalogue } from '../hooks/use-reports';
import type { ReportDomain } from '../types';

type Chip = ReportDomain | 'all' | 'pinned';

export default function ReportsPage() {
    const t = useT();
    const { data: reports = [], isLoading } = useReportCatalogue();
    const [query, setQuery] = useState('');
    const [chip, setChip] = useState<Chip>('all');
    const [period, setPeriod] = useSnapshotPeriod();
    const domains = [...new Set(reports.map((r) => r.domain))].sort(byDomainOrder);
    const pinnedCount = reports.filter((r) => r.pinned).length;
    // Un-pinning the last pinned report while its chip is open falls back to "all".
    const domain: Chip = chip === 'pinned' && pinnedCount === 0 ? 'all' : chip;
    const chips: { id: Chip; label: string; count: number }[] = [
        { id: 'all', label: t('rep_filter_all'), count: reports.length },
        ...(pinnedCount > 0 ? [{ id: 'pinned' as const, label: t('rep_filter_pinned'), count: pinnedCount }] : []),
        ...domains.map((d) => ({ id: d, label: t(`rep_domain_${d}`), count: reports.filter((r) => r.domain === d).length })),
    ];
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return reports.filter((r) => {
            if (domain === 'pinned' && !r.pinned) return false;
            if (domain !== 'all' && domain !== 'pinned' && r.domain !== domain) return false;
            if (!q) return true;
            const stem = reportStem(r.key);
            return `${t(`rep_${stem}_title`)} ${t(`rep_${stem}_desc`)}`.toLowerCase().includes(q);
        });
    }, [reports, query, domain, t]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{t('rep_center_title')}</h1>
                    <p className="text-muted-foreground mt-1 max-w-[72ch] text-sm">{t('rep_center_sub')}</p>
                </div>
                <PeriodSwitch period={period} onChange={setPeriod} />
            </div>

            <SnapshotStrip period={period} />

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-4">
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
                            <div className="space-y-3.5">
                                <div className="relative w-full">
                                    <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        id="report-search"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder={t('rep_search_placeholder')}
                                        className="pl-9"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {chips.map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setChip(c.id)}
                                            className={cn(
                                                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold',
                                                domain === c.id
                                                    ? 'bg-brand border-brand text-brand-foreground'
                                                    : 'border-border text-muted-foreground bg-background',
                                            )}
                                        >
                                            {c.id === 'pinned' && <Star className="h-3.5 w-3.5" />}
                                            {c.label}
                                            <span className="font-mono opacity-70">{c.count}</span>
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

                <aside className="space-y-4">
                    <MyExports />
                    <ScheduledReports />
                </aside>
            </div>
        </div>
    );
}
