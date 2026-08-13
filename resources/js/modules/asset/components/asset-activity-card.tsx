import { useT } from '@/lang';
import { CurrentMonthLegend, MonthBarChart } from '@/shared/components/month-bar-chart';
import { cn } from '@/shared/lib/utils';
import type { AssetSummary } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';

type View = 'handover' | 'returned';

/**
 * Custody activity over the last 12 months: how many assets went out to people and how many
 * came back into the pool. Two series in a half-width card would be twenty-four bars wide,
 * so one shows at a time and a pair of buttons switches which — the same reading the rest of
 * the dashboard gives, one question at a time.
 *
 * The view is component state, not a URL parameter: it is a way of looking at one card, not
 * a filter someone would want to link to or come back to.
 */
export function AssetActivityCard({ data }: { data: AssetSummary['activity_12m'] }) {
    const t = useT();
    const [view, setView] = useState<View>('handover');

    const bars = data.map((m) => ({ month: m.month, count: view === 'handover' ? m.handover : m.returned }));

    return (
        <Card className="overflow-hidden">
            <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-3.5">
                <div className="flex items-center gap-2">
                    <ArrowLeftRight className="text-muted-foreground h-4 w-4" />
                    <span className="text-sm font-semibold">{t('asset_activity_title')}</span>
                </div>
                <div className="bg-muted flex shrink-0 gap-0.5 rounded-lg p-0.5">
                    {(['handover', 'returned'] as const).map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            className={cn(
                                'rounded-[6px] px-2.5 py-1 text-xs font-semibold transition',
                                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t(v === 'handover' ? 'asset_handover' : 'asset_returned')}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-5 pt-5 pb-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                    <p className="text-muted-foreground text-xs">
                        {t(view === 'handover' ? 'asset_activity_cap_handover' : 'asset_activity_cap_returned')}
                    </p>
                    <CurrentMonthLegend />
                </div>

                <MonthBarChart data={bars} emptyLabel={t(view === 'handover' ? 'asset_activity_none_handover' : 'asset_activity_none_returned')} />
            </div>
        </Card>
    );
}
