// A KPI tile on a report page or the Dashboard: the shared StatCard at its compact size.
import { StatCard, type StatCardProps } from '@/shared/components/stat-card';

export { slaLevel, type SlaLevel } from '@/shared/lib/sla-level';

export function KpiTile(props: Omit<StatCardProps, 'size'>) {
    return <StatCard size="compact" {...props} />;
}
