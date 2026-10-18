// Overview tab header: "ภาพรวม" plus the period buttons (7 / 30 / 90 days, this year, all, custom range; each module picks which).
// The period lives in the URL (?range=7|30|90|year|custom&from&to); the module's default period stays out of it.
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useListParams } from '@/shared/hooks/use-list-params';
import { cn } from '@/shared/lib/utils';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { Gauge } from 'lucide-react';
import { useState } from 'react';

import { PRESETS, readOverviewPeriod, spanDays, type OverviewPeriod, type PeriodOptions } from '@/shared/lib/overview-period-core';
import { useNumberFormat } from '@/shared/hooks/use-number-format';

export { overviewPeriodKey, overviewPeriodParams, periodReachesToday, readOverviewPeriod, spanDays } from '@/shared/lib/overview-period-core';
export type { OverviewPeriod, PeriodOptions } from '@/shared/lib/overview-period-core';

/** The overview period kept in the URL. */
export function useOverviewPeriod(options?: PeriodOptions): [OverviewPeriod, (next: OverviewPeriod) => void] {
    const list = useListParams();
    const fallback = options?.fallback ?? 'all';
    const period = readOverviewPeriod(list.get('range'), list.get('from'), list.get('to'), options);
    const setPeriod = (next: OverviewPeriod) =>
        list.setParams(
            typeof next === 'object'
                ? { range: 'custom', from: next.from, to: next.to }
                : { range: next === fallback ? null : String(next), from: null, to: null },
        );
    return [period, setPeriod];
}

const SEGMENT = 'press rounded-md px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2';
const segmentTone = (active: boolean) => (active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground');

/** Period buttons. "กำหนดเอง" opens the shared range calendar, which applies only on "นำไปใช้". */
export function OverviewPeriodSelect({
    value,
    onChange,
    options,
}: {
    value: OverviewPeriod;
    onChange: (next: OverviewPeriod) => void;
    options?: PeriodOptions;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fmt = useDateFormat();
    const custom = typeof value === 'object';
    const [tooLong, setTooLong] = useState(false);
    const buttons: (number | 'all' | 'year')[] = [
        ...PRESETS,
        ...(options?.year ? (['year'] as const) : []),
        ...(options?.allowAll === false ? [] : (['all'] as const)),
    ];

    // A range over the limit is not applied; the reader is told instead of the range being cut quietly
    const pickRange = (from: string, to: string) => {
        const over = options?.maxDays != null && spanDays(from, to) > options.maxDays;
        setTooLong(over);
        if (!over) onChange({ from, to });
    };

    return (
        <div className="flex flex-col items-end gap-1">
            <div className="border-border inline-flex flex-wrap rounded-lg border p-0.5">
                {buttons.map((d) => (
                    <button
                        key={d}
                        type="button"
                        aria-pressed={value === d}
                        onClick={() => {
                            setTooLong(false);
                            onChange(d);
                        }}
                        className={cn(SEGMENT, segmentTone(value === d))}
                    >
                        {d === 'all' ? t('all') : d === 'year' ? t('period_this_year') : t('period_days').replace('{n}', fmtN(d))}
                    </button>
                ))}
                <DateRangeInput from={custom ? value.from : ''} to={custom ? value.to : ''} align="end" onChange={pickRange}>
                    <button type="button" aria-pressed={custom} className={cn(SEGMENT, segmentTone(custom))}>
                        {custom ? fmt.range(value.from, value.to) : t('period_custom')}
                    </button>
                </DateRangeInput>
            </div>
            {tooLong && options?.maxDays != null && (
                <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                    {t('period_max_days').replace('{n}', fmtN(options.maxDays))}
                </p>
            )}
        </div>
    );
}

/** The row above an Overview tab's cards: icon + "ภาพรวม", the period buttons when given a period; owns its height and the 20px under it. */
export function OverviewHeader({
    value,
    onChange,
    options,
    className,
}: {
    value?: OverviewPeriod;
    onChange?: (next: OverviewPeriod) => void;
    options?: PeriodOptions;
    className?: string;
}) {
    const t = useT();
    return (
        <div className={cn('mb-5 flex min-h-8 flex-wrap items-center justify-between gap-3', className)}>
            <div className="flex items-center gap-2">
                <Gauge className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-semibold">{t('sub_overview')}</span>
            </div>
            {value !== undefined && onChange && <OverviewPeriodSelect value={value} onChange={onChange} options={options} />}
        </div>
    );
}
