// Overview tab header: "ภาพรวม" plus the period buttons (7 / 30 / 90 days, all, custom range).
// The period lives in the URL (?range=7|30|90|custom&from&to); all time, the default, stays out of it.
import { useT } from '@/lang';
import { useListParams } from '@/shared/hooks/use-list-params';
import { formatRangeShort } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { useUiStore } from '@/stores/ui';
import { Gauge } from 'lucide-react';

export type OverviewPeriod = number | 'all' | { from: string; to: string };

const PRESETS = [7, 30, 90] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The period from the URL values; anything unknown is all time. */
export function readOverviewPeriod(range: string, from: string, to: string): OverviewPeriod {
    if (range === 'custom') {
        return ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to ? { from, to } : 'all';
    }
    const days = Number(range);
    return (PRESETS as readonly number[]).includes(days) ? days : 'all';
}

/** API query params for a period: ?days=7|30|90|all or ?from&to. */
export function overviewPeriodParams(period: OverviewPeriod): Record<string, string | number> {
    return typeof period === 'object' ? { from: period.from, to: period.to } : { days: period };
}

/** Whether the period runs up to today, so its last chart column is the one still being lived through. */
export function periodReachesToday(period: OverviewPeriod, today = new Date()): boolean {
    if (typeof period !== 'object') return true;
    const pad = (n: number) => String(n).padStart(2, '0');
    return period.to >= `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/** A stable query-key part for a period. */
export const overviewPeriodKey = (period: OverviewPeriod) => (typeof period === 'object' ? `${period.from}_${period.to}` : String(period));

/** The overview period kept in the URL. */
export function useOverviewPeriod(): [OverviewPeriod, (next: OverviewPeriod) => void] {
    const list = useListParams();
    const period = readOverviewPeriod(list.get('range'), list.get('from'), list.get('to'));
    const setPeriod = (next: OverviewPeriod) =>
        list.setParams(
            typeof next === 'object'
                ? { range: 'custom', from: next.from, to: next.to }
                : { range: next === 'all' ? null : String(next), from: null, to: null },
        );
    return [period, setPeriod];
}

const SEGMENT = 'rounded-md px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2';
const segmentTone = (active: boolean) => (active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground');

/** Period buttons. "กำหนดเอง" opens the shared range calendar, which applies only on "นำไปใช้". */
export function OverviewPeriodSelect({ value, onChange }: { value: OverviewPeriod; onChange: (next: OverviewPeriod) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const custom = typeof value === 'object';

    return (
        <div className="border-border inline-flex flex-wrap rounded-lg border p-0.5">
            {[...PRESETS, 'all' as const].map((d) => (
                <button
                    key={d}
                    type="button"
                    aria-pressed={value === d}
                    onClick={() => onChange(d)}
                    className={cn(SEGMENT, segmentTone(value === d))}
                >
                    {d === 'all' ? t('all') : t('period_days').replace('{n}', String(d))}
                </button>
            ))}
            <DateRangeInput from={custom ? value.from : ''} to={custom ? value.to : ''} align="end" onChange={(from, to) => onChange({ from, to })}>
                <button type="button" aria-pressed={custom} className={cn(SEGMENT, segmentTone(custom))}>
                    {custom ? formatRangeShort(value.from, value.to, lang) : t('period_custom')}
                </button>
            </DateRangeInput>
        </div>
    );
}

/** The row above an Overview tab's cards: icon + "ภาพรวม" on the left, the period buttons on the right (only when given a period). */
export function OverviewHeader({
    value,
    onChange,
    className,
}: {
    value?: OverviewPeriod;
    onChange?: (next: OverviewPeriod) => void;
    className?: string;
}) {
    const t = useT();
    return (
        <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
            <div className="flex items-center gap-2">
                <Gauge className="text-muted-foreground h-4 w-4" />
                <span className="text-sm font-semibold">{t('sub_overview')}</span>
            </div>
            {value !== undefined && onChange && <OverviewPeriodSelect value={value} onChange={onChange} />}
        </div>
    );
}
