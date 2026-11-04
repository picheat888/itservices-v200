// "ต้องดูตอนนี้": one page of overdue, near-due and waiting cases, with the page counter.
import { cn } from '@/shared/lib/utils';
import { useMonitorT } from '../hooks/use-monitor-prefs';
import type { PageEntry } from '../lib/monitor-rows';
import { dueWords, waitedWords } from '../lib/monitor-time';
import type { MonitorRow } from '../types';
import { GROUP_DOT, GROUP_INK, priorityDot, priorityKey } from './monitor-parts';

const LONG_TIME_CHARS = 16;

export function MustSeeList({
    page,
    pageIndex,
    pageCount,
    now,
    isNew,
    motionFor,
}: {
    page: PageEntry[];
    pageIndex: number;
    pageCount: number;
    now: number;
    isNew: (id: number) => boolean;
    /** row-in for a row new since the last board, monitor-flash for one that just went overdue */
    motionFor: (id: number) => string | undefined;
}) {
    const t = useMonitorT();

    return (
        <section className="bg-card flex min-h-0 flex-col overflow-hidden rounded-2xl border shadow-sm dark:shadow-none">
            <div className="dark:bg-muted/70 flex items-center justify-between border-b px-7 pt-4 pb-3">
                <h2 className="text-[32px] font-bold">{t('mon_list_title')}</h2>
                {pageCount > 1 && (
                    <div className="text-muted-foreground flex items-center gap-4.5 text-[26px] font-semibold">
                        <span>
                            {t('mon_page')
                                .replace('{a}', String(pageIndex + 1))
                                .replace('{b}', String(pageCount))}
                        </span>
                        <span className="flex gap-2.5" aria-hidden>
                            {Array.from({ length: pageCount }, (_, i) => (
                                <i
                                    key={i}
                                    className={cn(
                                        'size-4 rounded-full border-2',
                                        i === pageIndex ? 'border-foreground bg-foreground' : 'border-muted-foreground',
                                    )}
                                />
                            ))}
                        </span>
                    </div>
                )}
            </div>

            {page.length === 0 ? (
                <div className="text-muted-foreground grid flex-1 place-content-center justify-items-center gap-3">
                    <b className="text-[40px] text-emerald-700 dark:text-emerald-400">{t('mon_calm_title')}</b>
                    <span className="text-[24px]">{t('mon_calm_hint')}</span>
                </div>
            ) : (
                // Keyed by page, so a new page fades in instead of cutting
                <div key={pageIndex} className="motion-content-in flex min-h-0 flex-col motion-reduce:animate-none">
                    {page.map((entry) =>
                        entry.kind === 'head' ? (
                            <div
                                key={`head-${entry.group}`}
                                className={cn(
                                    'bg-muted dark:bg-muted/40 flex h-10 items-center gap-3 px-7 text-[21px] font-semibold',
                                    GROUP_INK[entry.group],
                                )}
                            >
                                <span className={cn('size-3 rounded-full', GROUP_DOT[entry.group])} aria-hidden />
                                <span>{t(`mon_group_${entry.group}`)}</span>
                                <span className="text-muted-foreground font-normal">
                                    {t(entry.count === 1 ? 'mon_group_count_one' : 'mon_group_count').replace('{n}', String(entry.count))}
                                </span>
                            </div>
                        ) : (
                            <CaseRow key={entry.row.id} row={entry.row} now={now} isNew={isNew(entry.row.id)} motion={motionFor(entry.row.id)} />
                        ),
                    )}
                </div>
            )}
        </section>
    );
}

function CaseRow({ row, now, isNew, motion }: { row: MonitorRow; now: number; isNew: boolean; motion?: string }) {
    const t = useMonitorT();
    const time = dueWords(Date.parse(row.due_at), now, t);
    const timeInk =
        row.group === 'overdue' ? 'text-red-700 dark:text-red-400' : row.group === 'near' ? 'text-amber-800 dark:text-amber-400' : 'text-foreground';
    const prio = priorityKey(row.priority);

    return (
        <div className={cn('border-border/60 grid h-[84px] grid-cols-[300px_140px_minmax(0,1fr)_250px] items-center gap-5 border-b px-7', motion)}>
            <div>
                <b className={cn('block leading-[1.1] whitespace-nowrap', time.length >= LONG_TIME_CHARS ? 'text-[30px]' : 'text-[38px]', timeInk)}>
                    {time}
                </b>
                <span className="text-muted-foreground text-[19px]">{t(row.clock === 'response' ? 'mon_clock_response' : 'mon_clock_resolve')}</span>
            </div>
            <div className="flex items-center gap-2.5 text-[25px] font-semibold">
                {prio ? (
                    <>
                        <span className={cn('size-3.5 shrink-0 rounded-full', priorityDot(row.priority))} aria-hidden />
                        {t(prio)}
                    </>
                ) : (
                    <span className="text-muted-foreground font-normal">{t('mon_no_priority')}</span>
                )}
            </div>
            <div className="min-w-0">
                <b className="block truncate text-[31px] leading-[1.25] font-semibold">
                    {row.subject}
                    {isNew && (
                        <span className="ml-3 rounded-lg bg-blue-50 px-2.5 align-[5px] text-[19px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {t('mon_new_tag')}
                        </span>
                    )}
                </b>
                <span className="text-muted-foreground block truncate text-[20px]">
                    {row.ticket_no}
                    {row.department && <span className="ml-3">{row.department}</span>}
                </span>
            </div>
            <Who row={row} now={now} />
        </div>
    );
}

function Who({ row, now }: { row: MonitorRow; now: number }) {
    const t = useMonitorT();

    if (row.assignee) {
        return (
            <div className="flex min-w-0 items-center gap-3 text-[24px] leading-[1.2]">
                <span className="bg-muted grid size-[46px] shrink-0 place-items-center rounded-full text-[19px] font-bold">
                    {row.assignee.initials}
                </span>
                <span className="truncate">{row.assignee.name}</span>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 items-center gap-3 text-[24px] leading-[1.2]">
            <span
                className="grid size-[46px] shrink-0 place-items-center rounded-full border-2 border-amber-600 text-[19px] font-bold text-amber-800 dark:border-amber-400 dark:text-amber-400"
                aria-hidden
            >
                ?
            </span>
            <span className={cn(row.group === 'overdue' ? 'text-foreground' : 'text-muted-foreground')}>
                {row.group === 'overdue' ? t('mon_unassigned') : waitedWords(now - Date.parse(row.created_at), t)}
            </span>
        </div>
    );
}
