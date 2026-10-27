// The four count summary cards (counted, same, short, over) shared by the review and confirmed-sheet dialogs.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { cn } from '@/shared/lib/utils';
import type { SheetSummary } from '../../lib/count-sheet';

function KpiCard({ label, value, foot, valueClassName }: { label: string; value: string; foot: string; valueClassName?: string }) {
    return (
        <div className="border-border rounded-lg border px-3 py-2.5 text-center">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={cn('text-xl font-bold tabular-nums', valueClassName)}>{value}</div>
            <div className="text-muted-foreground mt-0.5 text-xs tabular-nums">{foot}</div>
        </div>
    );
}

export function CountKpiCards({ summary }: { summary: SheetSummary }) {
    const t = useT();
    const fmtN = useNumberFormat();
    return (
        <div className="grid shrink-0 grid-cols-4 gap-2">
            <KpiCard
                label={t('stock_count_kpi_counted')}
                value={fmtN(summary.counted)}
                foot={t('stock_count_kpi_of').replace('{n}', fmtN(summary.total))}
            />
            <KpiCard label={t('stock_count_kpi_same')} value={fmtN(summary.same)} foot={t('stock_count_kpi_no_adjust')} />
            <KpiCard
                label={t('stock_count_kpi_short')}
                value={fmtN(summary.short)}
                foot={t('stock_count_kpi_sum_short').replace('{n}', fmtN(summary.shortQty))}
                valueClassName="text-red-700 dark:text-red-400"
            />
            <KpiCard
                label={t('stock_count_kpi_over')}
                value={fmtN(summary.over)}
                foot={t('stock_count_kpi_sum_over').replace('{n}', fmtN(summary.overQty))}
                valueClassName="text-emerald-700 dark:text-emerald-400"
            />
        </div>
    );
}
