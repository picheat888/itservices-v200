// Settings → Ticket & SLA: the "วันหยุด" section — year buttons, a month-by-month summary and the editor dialog.
// The chosen year lives in ?holidays= (the bell links here) and the open editor in ?holidays_edit=1.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { LoadFailedPanel } from '@/shared/components/load-failed';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { keepDialogState } from '@/shared/hooks/use-dialog-param';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { SlaHoliday } from '../api/settingsApi';
import { useSlaHolidays } from '../hooks/use-settings';
import { holidayYears, localIsoDate, monthSummary } from '../lib/sla-holidays';
import { OPENER_ID, SlaHolidayEditorDialog } from './sla-holiday-editor-dialog';
import { fillText, jumpTo, SECTION, SectionHead, TABLE } from './sla-parts';

const HOLIDAYS_SECTION_ID = 'sla-sec-holidays';
// History entries whose ?holidays= link already scrolled here, so Back to one does not scroll again
const SHOWN_ENTRIES = new Set<string>();
const YEAR_PARAM = 'holidays';
const EDIT_PARAM = 'holidays_edit';

const YEAR_CHIP =
    'border-input bg-background text-muted-foreground hover:border-brand/50 relative h-10 min-w-[66px] rounded-lg border px-3.5 text-sm font-semibold tabular-nums transition-colors';
const YEAR_CHIP_ON = 'border-brand bg-brand/10 text-brand-ink hover:border-brand';

/** Writes ?holidays=<year> in place, so the year survives a reload without a history entry per press. */
export function useHolidayYearParam(): (year: number) => void {
    const [, setParams] = useSearchParams();
    return (year: number) =>
        setParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set(YEAR_PARAM, String(year));
                return next;
            },
            { replace: true, state: keepDialogState() },
        );
}

const rowsOfYear = (rows: SlaHoliday[], year: number) => rows.filter((r) => r.date.startsWith(`${year}-`));

export function SlaHolidaysSection({ workDays }: { workDays: number[] }) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const { data, isLoading, isError, refetch } = useSlaHolidays();
    const [params] = useSearchParams();
    const setYearParam = useHolidayYearParam();
    const dialogs = usePageDialogs();

    const today = localIsoDate(new Date());
    const thisYear = Number(today.slice(0, 4));
    const all = useMemo(() => data ?? [], [data]);
    const years = holidayYears(
        all.map((r) => r.date),
        thisYear,
    );
    const asked = Number(params.get(YEAR_PARAM));
    const year = years.includes(asked) ? asked : thisYear;
    const rows = useMemo(() => rowsOfYear(all, year), [all, year]);
    const months = useMemo(() => monthSummary(rows, today), [rows, today]);
    const editorOpen = params.get(EDIT_PARAM) === '1';

    // A link that names a year (the bell, the summary card) brings the section into view once the list is in
    const paramText = params.get(YEAR_PARAM);
    const shownFor = useRef<string | null>(null);
    const location = useLocation();
    useEffect(() => {
        if (!paramText || !data) return;
        const entry = `${location.key}|${paramText}`;
        const seen = shownFor.current === paramText || SHOWN_ENTRIES.has(entry);
        shownFor.current = paramText;
        SHOWN_ENTRIES.add(entry);
        if (!seen) jumpTo(HOLIDAYS_SECTION_ID, 'start');
    }, [paramText, data, location.key]);

    const pickYear = (next: number) => {
        shownFor.current = String(next);
        setYearParam(next);
    };
    const openEditor = () => dialogs.open({ [EDIT_PARAM]: '1' });
    const closeEditor = () => dialogs.close([EDIT_PARAM]);

    const count = rows.length;
    const yearText = fmt.year(year);

    return (
        <section id={HOLIDAYS_SECTION_ID} tabIndex={-1} aria-labelledby="sla-h-hol" className={SECTION}>
            <SectionHead
                id="sla-h-hol"
                title={t('set_hol_title')}
                desc={t('set_hol_desc')}
                aside={data ? fillText(t(count ? 'set_hol_count' : 'set_hol_missing'), { year: yearText, n: fmtN(count) }) : undefined}
                asideWarn={!!data && count === 0}
            />

            {/* Year buttons and the edit button */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div role="group" aria-label={t('set_hol_years')} className="mr-auto flex flex-wrap gap-2">
                    {years.map((y) => {
                        const empty = !!data && rowsOfYear(all, y).length === 0;
                        return (
                            <button
                                key={y}
                                type="button"
                                aria-pressed={y === year}
                                onClick={() => pickYear(y)}
                                className={cn(YEAR_CHIP, y === year && YEAR_CHIP_ON)}
                            >
                                {fmt.year(y)}
                                {empty && (
                                    <>
                                        <span aria-hidden className="absolute top-1.5 right-1.5 size-[7px] rounded-full bg-red-600 dark:bg-red-500" />
                                        <span className="sr-only"> {t('set_hol_year_empty')}</span>
                                    </>
                                )}
                            </button>
                        );
                    })}
                </div>
                {count > 0 && (
                    <Button id={OPENER_ID} type="button" variant="outline" onClick={openEditor}>
                        <Pencil aria-hidden />
                        {fillText(t('set_hol_edit'), { year: yearText })}
                    </Button>
                )}
            </div>

            {/* Month summary, or why the year is empty */}
            {isLoading ? (
                <div role="status" className={cn(TABLE, 'grid gap-2 p-3.5')}>
                    {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-6" aria-hidden />
                    ))}
                    <span className="sr-only">{t('loading')}</span>
                </div>
            ) : isError && !data ? (
                <div className={TABLE}>
                    <LoadFailedPanel onRetry={() => void refetch()} />
                </div>
            ) : count === 0 ? (
                <div className={TABLE}>
                    <EmptyState
                        title={fillText(t('set_hol_empty'), { year: yearText })}
                        hint={fillText(t('set_hol_empty_hint'), { year: yearText })}
                        className="min-h-[220px]"
                    >
                        <Button id={OPENER_ID} type="button" onClick={openEditor}>
                            <Pencil aria-hidden />
                            {fillText(t('set_hol_add_year'), { year: yearText })}
                        </Button>
                    </EmptyState>
                </div>
            ) : (
                <div
                    role="list"
                    aria-label={fillText(t('set_hol_by_month'), { year: yearText })}
                    className="border-border bg-card grid grid-cols-1 gap-x-7 rounded-lg border px-3.5 py-1 @2xl:grid-cols-2"
                >
                    {months.map(({ month, items }) => (
                        <div
                            key={month}
                            role="listitem"
                            className="border-border grid grid-cols-[3.25rem_minmax(0,1fr)] gap-3 border-t py-1.5 text-sm first:border-t-0 @2xl:[&:nth-child(2)]:border-t-0"
                        >
                            <span className="text-muted-foreground font-semibold">{fmt.month(`${year}-${String(month).padStart(2, '0')}-01`)}</span>
                            <span className="flex min-w-0 flex-col">
                                {items.map((item) => (
                                    <span key={`${item.from}-${item.name}`} className={cn(item.past && 'text-muted-foreground')}>
                                        <span className="tabular-nums">{item.from === item.to ? item.from : `${item.from}–${item.to}`}</span>{' '}
                                        {item.name}
                                        {item.next && (
                                            <span className="bg-brand/12 text-brand-ink ml-2 rounded-full px-2 text-[11px] font-semibold">
                                                {t('set_hol_next')}
                                            </span>
                                        )}
                                    </span>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <SlaHolidayEditorDialog
                open={editorOpen && !!data}
                year={year}
                saved={rows}
                previousYear={rowsOfYear(all, year - 1)}
                workDays={workDays}
                onClose={closeEditor}
            />
        </section>
    );
}
