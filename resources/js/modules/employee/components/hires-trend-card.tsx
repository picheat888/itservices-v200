import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { TrendingUp } from 'lucide-react';
import type { EmployeeHiresMonth } from '../api/orgApi';

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Fixed 12-month hiring-trend bar chart: shows the last 12 months (current month on
 * the right, spotlighted in solid brand; past months fade back). No scrolling — the
 * window is a fixed rolling 12 months so it stays a compact "recent activity" read.
 */
export function HiresTrendCard({ data }: { data: EmployeeHiresMonth[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const max = Math.max(1, ...data.map((d) => d.count));
    const lastIndex = data.length - 1;

    const label = (ym: string) => {
        const [y, m] = ym.split('-').map(Number);
        const mon = (lang === 'th' ? TH_MON : EN_MON)[(m || 1) - 1];
        const yy = (lang === 'th' ? y + 543 : y) % 100;
        return { mon, yy };
    };

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
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-[11.5px]">
                        <i className="bg-brand h-2.5 w-2.5 rounded-[3px]" />
                        {t('emp_current_month')}
                    </span>
                </div>

                {data.length === 0 ? (
                    <div className="text-muted-foreground py-10 text-center text-sm">{t('emp_no_hires')}</div>
                ) : (
                    <div className="flex h-[172px] items-end gap-2.5 pt-[22px]">
                        {data.map((d, i) => {
                            const now = i === lastIndex;
                            const { mon, yy } = label(d.month);
                            return (
                                <div key={d.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                                    <div
                                        className={cn('relative w-full max-w-[32px] rounded-t-md', now ? 'bg-brand' : 'bg-brand/35')}
                                        style={{ height: `${(d.count / max) * 100}%`, minHeight: 3 }}
                                    >
                                        <span
                                            className={cn(
                                                'absolute -top-[18px] right-0 left-0 text-center font-mono text-[11px] font-semibold',
                                                now ? 'text-brand' : 'text-muted-foreground',
                                            )}
                                        >
                                            {d.count}
                                        </span>
                                    </div>
                                    <div className="text-center font-mono text-[10.5px] whitespace-nowrap">
                                        <b className={cn('block font-semibold', now ? 'text-brand' : 'text-foreground')}>{mon}</b>
                                        <span className="text-muted-foreground">{yy}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Card>
    );
}
