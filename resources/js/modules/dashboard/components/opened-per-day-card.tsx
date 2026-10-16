// Dashboard IT card "Ticket เปิดใหม่ต่อวัน": 14 daily bars with dashed guide lines, stretched to the card's height.
import { useT } from '@/lang';
import { CardEmpty, CardTitle, FILL, heldStyle } from '@/modules/report';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import type { DailyCount } from '../api/dashboardApi';
import { niceAxis } from '../lib/dash-math';
import { WIDE } from './dash-parts';

export function OpenedPerDayCard({
    volume,
    cardRef,
    heldHeight,
}: {
    volume: DailyCount[];
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const total = volume.reduce((sum, day) => sum + day.count, 0);
    const { top, ticks } = niceAxis(Math.max(0, ...volume.map((day) => day.count)));
    const at = (value: number) => `${(value / top) * 100}%`;

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={WIDE}>
            <CardTitle
                level="h3"
                title={t('dash_opened_per_day')}
                note={t('dash_last_14d')}
                sub={t('dash_total_cases').replace('{n}', String(total))}
            />
            {total === 0 ? (
                <CardEmpty>{t('dash_empty_window')}</CardEmpty>
            ) : (
                <div className="flex min-h-[200px] flex-1 flex-col px-5 pt-5 pb-3">
                    {/* Plot */}
                    <div className="flex flex-1 gap-2">
                        <div className="text-muted-foreground relative w-6 shrink-0 text-[10px] tabular-nums">
                            {ticks.map((tick) => (
                                <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: at(tick) }}>
                                    {tick}
                                </span>
                            ))}
                        </div>
                        <div className="relative flex-1">
                            {ticks.map((tick) => (
                                <div
                                    key={tick}
                                    aria-hidden
                                    className="border-border absolute inset-x-0 border-t border-dashed"
                                    style={{ bottom: at(tick) }}
                                />
                            ))}
                            <div className="absolute inset-0 flex gap-1">
                                {volume.map((day) => (
                                    <div key={day.date} className="relative h-full flex-1" title={`${fmt.date(day.date)}: ${day.count}`}>
                                        <div
                                            className={cn('absolute inset-x-0 bottom-0 mx-auto max-w-7 rounded-t', FILL.blue)}
                                            style={{ height: at(day.count) }}
                                        />
                                        {day.count > 0 && (
                                            <span
                                                className="absolute inset-x-0 mb-0.5 text-center text-[10px] font-semibold tabular-nums"
                                                style={{ bottom: at(day.count) }}
                                            >
                                                {day.count}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Day labels: the month on the first day and where it changes */}
                    <div className="text-muted-foreground mt-1.5 flex gap-1 pl-8 text-[10px]">
                        {volume.map((day, i) => {
                            const dayOfMonth = Number(day.date.slice(8, 10));
                            return (
                                <span key={day.date} className="flex-1 truncate text-center tabular-nums">
                                    {i === 0 || dayOfMonth === 1 ? fmt.dayMonth(day.date) : dayOfMonth}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
}
