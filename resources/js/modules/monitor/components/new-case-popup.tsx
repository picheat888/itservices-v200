// The new-case card over the monitor: one case in full, or "เคสใหม่ N เคส" with up to four rows; hides itself after 15 s.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Bell } from 'lucide-react';
import { dueWords } from '../lib/monitor-time';
import type { MonitorRow } from '../types';
import { priorityDot, priorityKey } from './monitor-parts';

const MAX_ROWS = 4;

export function NewCasePopup({ rows, now, shownAt, leftRatio }: { rows: MonitorRow[]; now: number; shownAt: string; leftRatio: number }) {
    const t = useT();
    const many = rows.length > 1;

    return (
        <div className="absolute inset-0 grid place-items-center bg-black/70">
            <div
                role="dialog"
                aria-labelledby="monitor-popup-title"
                className="bg-card animate-in zoom-in-95 fade-in w-[1180px] overflow-hidden rounded-3xl border-[3px] border-blue-400 shadow-2xl duration-300 motion-reduce:animate-none"
            >
                <div className="flex items-center justify-between bg-blue-950 px-10 py-6.5">
                    <div id="monitor-popup-title" className="flex items-center gap-4 text-[40px] font-bold text-blue-300">
                        <Bell className="size-11" aria-hidden />
                        {many ? t('mon_popup_many').replace('{n}', String(rows.length)) : t('mon_popup_one')}
                    </div>
                    <span className="text-muted-foreground text-[24px]">{shownAt}</span>
                </div>

                {many ? <ManyCases rows={rows} now={now} /> : <OneCase row={rows[0]} now={now} />}

                <div className="bg-muted h-2" aria-hidden>
                    <div className="h-full bg-blue-400" style={{ width: `${Math.max(0, leftRatio) * 100}%` }} />
                </div>
            </div>
        </div>
    );
}

function Priority({ row, className }: { row: MonitorRow; className?: string }) {
    const t = useT();
    const prio = priorityKey(row.priority);
    return (
        <div className={cn('flex items-center gap-3.5 font-semibold', className)}>
            {prio ? (
                <>
                    <span className={cn('size-[18px] shrink-0 rounded-full', priorityDot(row.priority))} aria-hidden />
                    {t(prio)}
                </>
            ) : (
                <span className="text-muted-foreground font-normal">{t('mon_no_priority')}</span>
            )}
        </div>
    );
}

function OneCase({ row, now }: { row: MonitorRow; now: number }) {
    const t = useT();
    return (
        <div className="flex flex-col gap-5.5 px-10 pt-8.5 pb-9">
            <div className="flex items-center gap-3.5 text-[30px]">
                <Priority row={row} />
                <span className="text-muted-foreground">{row.ticket_no}</span>
            </div>
            <div className="text-[56px] leading-[1.25] font-bold">{row.subject}</div>
            <div className="grid grid-cols-3 gap-6 border-t pt-4.5">
                <Fact label={t('mon_popup_department')} value={row.department ?? '-'} />
                <Fact label={t('mon_popup_requester')} value={row.requester ?? '-'} />
                <Fact label={t('mon_clock_response')} value={dueWords(Date.parse(row.due_at), now, t)} ink="text-blue-300" />
            </div>
        </div>
    );
}

function Fact({ label, value, ink }: { label: string; value: string; ink?: string }) {
    return (
        <div>
            <span className="text-muted-foreground block text-[22px]">{label}</span>
            <b className={cn('text-[32px]', ink)}>{value}</b>
        </div>
    );
}

function ManyCases({ rows, now }: { rows: MonitorRow[]; now: number }) {
    const t = useT();
    const shown = rows.slice(0, MAX_ROWS);
    return (
        <div className="flex flex-col px-10 pt-4 pb-6">
            {shown.map((row) => (
                <div key={row.id} className="grid grid-cols-[180px_minmax(0,1fr)_220px] items-center gap-5 border-b py-4 last:border-b-0">
                    <Priority row={row} className="text-[26px]" />
                    <div className="min-w-0">
                        <b className="block truncate text-[34px]">{row.subject}</b>
                        <span className="text-muted-foreground block text-[22px]">
                            {row.ticket_no}
                            {row.department && <span className="ml-3">{row.department}</span>}
                        </span>
                    </div>
                    <div className="text-right text-[30px] font-bold text-blue-300">{dueWords(Date.parse(row.due_at), now, t)}</div>
                </div>
            ))}
            {rows.length > MAX_ROWS && (
                <div className="text-muted-foreground pt-3 text-[24px]">{t('mon_popup_more').replace('{n}', String(rows.length - MAX_ROWS))}</div>
            )}
        </div>
    );
}
