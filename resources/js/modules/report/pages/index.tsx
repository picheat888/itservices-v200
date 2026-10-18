/**
 * Report Center page (/reports) — heading with the period control (PeriodSwitch), the number
 * strip (SnapshotStrip), then two columns as in the design: the reports this user may open
 * (search, module chips, and a "ปักหมุดไว้" card on top of the unfiltered list) on the left, and a rail with their queued files
 * (MyExports — "ไฟล์ส่งออกของฉัน") and scheduled report emails (ScheduledReports) on the
 * right. On xl the reports column is exactly two thirds of the page, so its right edge
 * lines up with the divider after the strip's fourth cell (six equal cells above it), and the
 * rail takes the last third less the gap. Below xl the rail follows the reports.
 * Server decides visibility (GET /api/reports → ReportCatalogue) and remembers pins.
 */
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { useListParams } from '@/shared/hooks/use-list-params';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { matchesAllWords } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { MyExports } from '../components/my-exports';
import { PeriodSwitch } from '../components/period-switch';
import { byDomainOrder, ReportCatalogue, ReportCatalogueSkeleton, reportStem } from '../components/report-catalogue';
import { ScheduledReports } from '../components/scheduled-reports';
import { SnapshotStrip } from '../components/snapshot-strip';
import { useReportRights } from '../hooks/use-report-rights';
import { useReportCatalogue } from '../hooks/use-reports';
import { useSnapshotRange } from '../hooks/use-snapshot-range';
import type { ReportDomain } from '../types';

type Chip = ReportDomain | 'all';

export default function ReportsPage() {
    const t = useT();
    const fmtN = useNumberFormat();
    const { seesMyExports } = useReportRights();
    const { data: reports = [], isLoading } = useReportCatalogue();
    // Search (?search) and module chip (?domain) live in the URL; a domain this user has no report in reads as all
    const list = useListParams();
    const query = list.get('search');
    const setQuery = (value: string) => list.setFilter('search', value);
    const [range, setRange] = useSnapshotRange();
    const domains = [...new Set(reports.map((r) => r.domain))].sort(byDomainOrder);
    const domainParam = list.get('domain');
    const domain: Chip = domains.find((d) => d === domainParam) ?? 'all';
    const setChip = (next: Chip) => list.setFilter('domain', next === 'all' ? '' : next);
    const chips: { id: Chip; label: string; count: number }[] = [
        { id: 'all', label: t('rep_filter_all'), count: reports.length },
        ...domains.map((d) => ({ id: d, label: t(`rep_domain_${d}`), count: reports.filter((r) => r.domain === d).length })),
    ];
    const visible = useMemo(() => {
        return reports.filter((r) => {
            if (domain !== 'all' && r.domain !== domain) return false;
            const stem = reportStem(r.key);
            return matchesAllWords(`${t(`rep_${stem}_title`)} ${t(`rep_${stem}_desc`)}`, query);
        });
    }, [reports, query, domain, t]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold">{t('rep_center_title')}</h1>
                    <p className="text-muted-foreground max-w-[72ch] text-sm">{t('rep_center_sub')}</p>
                </div>
                <PeriodSwitch range={range} onChange={setRange} />
            </div>

            <SnapshotStrip range={range} />

            <div className="grid items-start gap-5 xl:grid-cols-[66.6667%_minmax(0,1fr)]">
                <div className="min-w-0 space-y-4">
                    {isLoading ? (
                        <ReportCatalogueSkeleton />
                    ) : reports.length === 0 ? (
                        <EmptyState
                            kind="denied"
                            title={t('rep_empty_center_none')}
                            hint={t('rep_empty_center_none_hint')}
                            className="border-border rounded-xl border border-dashed"
                        />
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
                                        aria-label={t('rep_search_label')}
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="pl-9 text-ellipsis"
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
                                            {c.label}
                                            <span className="opacity-70">{fmtN(c.count)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {visible.length === 0 ? (
                                <EmptyState kind="search" title={t('rep_empty_center_search')} hint={t('rep_empty_center_search_hint')} />
                            ) : (
                                // Quick access on the plain view only; filtered or searched, pinned ones lead their group.
                                <ReportCatalogue reports={visible} showPinned={domain === 'all' && query.trim() === ''} range={range} />
                            )}
                        </>
                    )}
                </div>

                <aside className="space-y-4">
                    {seesMyExports && <MyExports />}
                    <ScheduledReports />
                </aside>
            </div>
        </div>
    );
}
