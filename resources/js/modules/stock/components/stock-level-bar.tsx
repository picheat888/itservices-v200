// Min/Max level bar of the stock page (bullet-chart style), shared with the stock reports through the barrel.
import { useT } from '@/lang';
import { formatNumber } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import type { StockItemStatus } from '@/shared/types';
import { useUiStore } from '@/stores/ui';

// Fixed screen anchors for the min/max gridlines, so markers line up across rows.
const BAR_MIN_X = 20;
const BAR_MAX_X = 80;

/** Each item status's badge tone on the stock pages. */
export const STOCK_STATUS_TONE: Record<StockItemStatus, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    ok: 'green',
    low: 'amber',
    out: 'red',
    over: 'blue',
    dead: 'gray',
};

/** Visual Min/Max bar: fixed min/max gridlines, current value scaled piecewise. */
export function StockLevelBar({
    current: cur,
    min,
    max,
    status,
    unit = '',
}: {
    current: number;
    min: number;
    max: number;
    status: StockItemStatus;
    unit?: string;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const n = (v: number) => formatNumber(v, lang);

    // Piecewise mapping: `min` lands on BAR_MIN_X and `max` on BAR_MAX_X.
    let curPct: number;
    if (cur <= min) {
        curPct = min > 0 ? (cur / min) * BAR_MIN_X : 0;
    } else if (cur <= max) {
        curPct = BAR_MIN_X + ((cur - min) / Math.max(1, max - min)) * (BAR_MAX_X - BAR_MIN_X);
    } else {
        const over = (cur - max) / Math.max(1, max - min);
        curPct = Math.min(100, BAR_MAX_X + over * (100 - BAR_MAX_X));
    }

    // Fill in the item status's badge tone: out red, below Min amber.
    const fill =
        status === 'out'
            ? 'bg-destructive'
            : status === 'low'
              ? 'bg-amber-500'
              : status === 'over'
                ? 'bg-blue-500'
                : status === 'dead'
                  ? 'bg-muted-foreground'
                  : 'bg-emerald-500';
    return (
        <div
            className="w-full min-w-[160px] pb-0.5"
            role="img"
            aria-label={t('stock_level_aria')
                .replace('{current}', n(cur))
                .replace(' {unit}', unit ? ` ${unit}` : '')
                .replace('{min}', n(min))
                .replace('{max}', n(max))}
        >
            <div className="dark:bg-muted relative h-1.5 w-full rounded-full bg-slate-200" aria-hidden>
                {/* Healthy band between the fixed min and max gridlines. */}
                <div
                    className="absolute inset-y-0 rounded-full bg-emerald-500/20"
                    style={{ left: `${BAR_MIN_X}%`, width: `${BAR_MAX_X - BAR_MIN_X}%` }}
                />
                <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-amber-600 dark:bg-amber-500" style={{ left: `${BAR_MIN_X}%` }} />
                <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-blue-600 dark:bg-blue-400" style={{ left: `${BAR_MAX_X}%` }} />
                <div className={cn('absolute inset-y-0 left-0 rounded-full', fill)} style={{ width: `${curPct}%` }} />
            </div>
            {/* Min / Max labels under the fixed gridlines. */}
            <div className="relative mt-1 h-3 text-[10px]" aria-hidden>
                <span className="absolute -translate-x-1/2 whitespace-nowrap text-amber-700 dark:text-amber-400" style={{ left: `${BAR_MIN_X}%` }}>
                    {n(min)}
                </span>
                <span className="absolute -translate-x-1/2 whitespace-nowrap text-blue-600 dark:text-blue-400" style={{ left: `${BAR_MAX_X}%` }}>
                    {n(max)}
                </span>
            </div>
        </div>
    );
}
