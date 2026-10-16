// Dashboard "คำขอ": 14- and 30-day request figures, then the stalled list and the split by type.
import { useT } from '@/lang';
import { CardEmpty, CardTitle, CODE_LINK, FILL, fold, FoldToggle, heldStyle, useFoldRow } from '@/modules/report';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/card';
import { CircleCheck, CircleX, FilePlus, Hourglass, Inbox, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardRequests } from '../api/dashboardApi';
import { useDashLinks } from '../hooks/use-dash-links';
import { sharePieces } from '../lib/dash-math';
import {
    CardLink,
    DashTile,
    HBarRow,
    LegendFooter,
    LIST_LIMIT,
    NARROW,
    PAIR_GRID,
    rowDelay,
    SectionHeading,
    SparkFooter,
    TILE_GRID,
    WIDE,
} from './dash-parts';

const FOLDS = ['types'] as const;
const TYPES_TOP = 5;

export function RequestsSection({ requests }: { requests: DashboardRequests }) {
    const t = useT();
    const links = useDashLinks();
    const row = useFoldRow(FOLDS);
    const declined = requests.rejected_30d + requests.cancelled_30d;

    return (
        <section aria-labelledby="dash-requests" className="space-y-3">
            <SectionHeading
                id="dash-requests"
                icon={Inbox}
                title={t('dash_sec_requests')}
                link={links.requestsHome ? { to: links.requestsHome, label: t('dash_go_requests') } : null}
            />
            <div className={TILE_GRID}>
                <DashTile
                    to={links.requestsAll}
                    icon={FilePlus}
                    label={t('dash_filed_14d')}
                    value={requests.filed.total}
                    unit={t('dash_unit_requests')}
                    footer={
                        <SparkFooter
                            text={t('dash_peak_requests').replace('{n}', String(requests.filed.peak))}
                            values={requests.filed.series}
                            className="text-blue-500"
                        />
                    }
                />
                <DashTile
                    to={links.requestsStatus('pending')}
                    icon={Hourglass}
                    label={t('req_status_pending')}
                    value={requests.pending.count}
                    unit={t('dash_unit_requests')}
                    alert={requests.pending.count > 0 ? 'amber' : undefined}
                    footer={requests.pending.count > 0 ? t('dash_oldest_days').replace('{n}', String(requests.pending.oldest_days)) : undefined}
                />
                <DashTile
                    to={links.requestsStatus('completed')}
                    icon={CircleCheck}
                    label={t('dash_completed_30d')}
                    value={requests.completed_30d}
                    unit={t('dash_unit_requests')}
                    footer={t('dash_from_filed').replace('{n}', String(requests.filed_30d))}
                />
                <DashTile
                    to={links.requestsStatus('rejected')}
                    icon={CircleX}
                    label={t('dash_declined_30d')}
                    value={declined}
                    unit={t('dash_unit_requests')}
                    bar={sharePieces([
                        { key: 'rejected', value: requests.rejected_30d, className: FILL.red },
                        { key: 'cancelled', value: requests.cancelled_30d, className: FILL.gray },
                    ])}
                    footer={
                        <LegendFooter
                            items={[
                                { key: 'rejected', label: t('req_status_rejected'), value: requests.rejected_30d, dot: FILL.red },
                                { key: 'cancelled', label: t('req_status_cancelled'), value: requests.cancelled_30d, dot: FILL.gray },
                            ]}
                        />
                    }
                />
                <DashTile
                    icon={Timer}
                    label={t('dash_avg_complete')}
                    value={requests.avg_days_to_complete ?? '—'}
                    unit={requests.avg_days_to_complete === null ? undefined : t('dash_unit_days')}
                    footer={t('dash_last_30d')}
                />
            </div>
            <div className={cn(PAIR_GRID, row.anyOpen && 'xl:items-start')}>
                <WaitingCard requests={requests} cardRef={row.left} heldHeight={row.heldLeft} />
                <ByTypeCard
                    requests={requests}
                    open={row.open.types}
                    onToggle={() => row.toggle('types')}
                    cardRef={row.right}
                    heldHeight={row.heldRight}
                />
            </div>
        </section>
    );
}

function WaitingCard({
    requests,
    cardRef,
    heldHeight,
}: {
    requests: DashboardRequests;
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
}) {
    const t = useT();
    const links = useDashLinks();
    const listLink = links.requestsStatus('pending');

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={WIDE}>
            <CardTitle
                title={t('dash_waiting_over').replace('{n}', String(requests.waiting_after_days))}
                sub={t('dash_n_requests').replace('{n}', String(requests.waiting_total))}
            />
            {requests.waiting.length === 0 ? (
                <CardEmpty>{t('dash_empty_waiting')}</CardEmpty>
            ) : (
                <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-xs">
                        <tr className="border-border/60 border-b">
                            <th className="px-5 py-2 text-left font-medium">{t('dash_col_request')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('dash_col_title')}</th>
                            <th className="hidden px-2 py-2 text-left font-medium md:table-cell">{t('dash_col_waiting_on')}</th>
                            <th className="px-5 py-2 text-right font-medium">{t('dash_col_waited')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.waiting.map((item, i) => {
                            const to = links.request(item.id);
                            return (
                                <tr key={item.id} className="dash-row border-border/60 border-b last:border-0" style={rowDelay(i)}>
                                    <td className="px-5 py-2.5 whitespace-nowrap tabular-nums">
                                        {to ? (
                                            <Link to={to} className={CODE_LINK}>
                                                {item.reference}
                                            </Link>
                                        ) : (
                                            item.reference
                                        )}
                                    </td>
                                    <td className="w-full max-w-0 truncate px-2 py-2.5" title={item.title}>
                                        {item.title}
                                    </td>
                                    <td className="text-muted-foreground hidden max-w-40 truncate px-2 py-2.5 md:table-cell">
                                        {item.waiting_on ?? '—'}
                                    </td>
                                    <td className="px-5 py-2.5 text-right">
                                        <StatusBadge tone="amber">{t('dash_n_days').replace('{n}', String(item.days))}</StatusBadge>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            {listLink && <CardLink to={listLink} total={requests.waiting_total} shown={LIST_LIMIT} />}
        </Card>
    );
}

function ByTypeCard({
    requests,
    open,
    onToggle,
    cardRef,
    heldHeight,
}: {
    requests: DashboardRequests;
    open: boolean;
    onToggle: () => void;
    cardRef: React.Ref<HTMLDivElement>;
    heldHeight: number | null;
}) {
    const t = useT();
    const total = requests.by_type.reduce((sum, item) => sum + item.count, 0);
    const scale = Math.max(1, ...requests.by_type.map((item) => item.count));
    const { folds, shown } = fold(requests.by_type, TYPES_TOP, open);

    return (
        <Card ref={cardRef} style={heldStyle(heldHeight)} className={NARROW}>
            <CardTitle title={t('dash_by_type')} note={t('dash_last_30d')} sub={t('dash_total_requests').replace('{n}', String(total))} />
            {total === 0 ? (
                <CardEmpty>{t('dash_empty_requests_window')}</CardEmpty>
            ) : (
                <ul className="flex flex-1 flex-col justify-between gap-1.5 px-5 py-3">
                    {shown.map((item, i) => (
                        <HBarRow key={item.type} label={t(`req_${item.type}`)} value={item.count} scale={scale} fill={FILL.blue} index={i} />
                    ))}
                </ul>
            )}
            {folds && <FoldToggle open={open} total={requests.by_type.length} onToggle={onToggle} />}
        </Card>
    );
}
