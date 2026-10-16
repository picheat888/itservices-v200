// Dashboard IT card "ภาระงานของทีม": the unassigned queue first, then each person's in-progress cases; folds after 10.
import { useT } from '@/lang';
import { CardEmpty, CardTitle, FILL, fold, FoldToggle, heldStyle, Swatch } from '@/modules/report';
import { Card } from '@/shared/ui/card';
import type { DashboardIt } from '../api/dashboardApi';
import { useDashLinks } from '../hooks/use-dash-links';
import { HBarRow, NARROW } from './dash-parts';

const WORKLOAD_TOP = 10;

export function WorkloadCard({
    it,
    open,
    onToggle,
    cardRef,
    heldHeight,
}: {
    it: DashboardIt;
    open: boolean;
    onToggle: () => void;
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
}) {
    const t = useT();
    const links = useDashLinks();
    const total = it.backlog.open + it.backlog.in_progress;
    const scale = Math.max(it.unassigned, ...it.workload.map((row) => row.open), 1);
    const { folds, shown } = fold(it.workload, WORKLOAD_TOP, open);

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={NARROW}>
            <CardTitle
                level="h3"
                title={t('dash_team_workload')}
                sub={
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                        <Swatch fill={FILL.blue}>{t('dash_legend_open')}</Swatch>
                        <Swatch fill={FILL.amber}>{t('ticket_in_progress')}</Swatch>
                        <span aria-hidden className="bg-border h-3 w-px" />
                        <span className="text-foreground font-semibold">{t('dash_backlog_total').replace('{n}', String(total))}</span>
                    </span>
                }
            />
            {total === 0 ? (
                <CardEmpty>{t('dash_empty_workload')}</CardEmpty>
            ) : (
                <ul className="flex flex-1 flex-col justify-between gap-1.5 px-5 py-3">
                    <HBarRow label={t('dash_no_assignee')} value={it.unassigned} scale={scale} fill={FILL.blue} index={0} strong to={links.pickup} />
                    {shown.map((row, i) => (
                        <HBarRow key={row.assignee_id} label={row.name ?? '—'} value={row.open} scale={scale} fill={FILL.amber} index={i + 1} />
                    ))}
                </ul>
            )}
            {folds && <FoldToggle open={open} total={it.workload.length} onToggle={onToggle} />}
        </Card>
    );
}
