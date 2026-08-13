import { useT } from '@/lang';
import { CurrentMonthLegend, MonthBarChart } from '@/shared/components/month-bar-chart';
import { Card } from '@/shared/ui/card';
import { TrendingUp } from 'lucide-react';
import type { EmployeeHiresMonth } from '../api/employeeApi';

/**
 * Hiring trend over the last 12 months. The bars themselves are the shared
 * `MonthBarChart` (the Assets dashboard draws its hand-over activity with the same one);
 * this card owns only the framing — what the numbers are about.
 */
export function HiresTrendCard({ data }: { data: EmployeeHiresMonth[] }) {
    const t = useT();

    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <TrendingUp className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-semibold">{t('emp_hires_trend')}</span>
                </div>
                <span className="text-muted-foreground text-xs">{t('emp_hires_window')}</span>
            </div>

            <div className="px-5 pt-5 pb-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                    <p className="text-muted-foreground text-xs">{t('emp_hires_trend_cap')}</p>
                    <CurrentMonthLegend />
                </div>

                <MonthBarChart data={data} emptyLabel={t('emp_no_hires')} />
            </div>
        </Card>
    );
}
