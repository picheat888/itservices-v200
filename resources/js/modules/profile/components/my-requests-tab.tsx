// My Profile drawer, Requests tab: the requests this person filed, in the Assets tab's table style.
import { useT } from '@/lang';
import { EmptyPane } from '@/shared/components/empty-pane';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { isOnBehalfRequest, REQUEST_ONBOARDING_BADGE, REQUEST_STATUS_META, REQUEST_TYPE_META, requestTitle } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Inbox } from 'lucide-react';
import { useState } from 'react';
import { HeadRow, LoadingRows, PAGE, SectionHeading, ShowAllRow, TableCard } from './profile-table';

type Row = Pick<ServiceRequest, 'id' | 'reference' | 'type' | 'origin' | 'status' | 'created_at' | 'title'>;

const ROW_GRID =
    'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-3 px-4';
const WIDE_ONLY = 'hidden lg:block';

export function MyRequestsTab({ requests, loading, seeAll }: { requests: Row[]; loading: boolean; seeAll?: React.ReactNode }) {
    const t = useT();
    const fmt = useDateFormat();
    const [showAll, setShowAll] = useState(false);

    if (loading) return <LoadingRows />;
    if (requests.length === 0) return <EmptyPane icon={Inbox} text={t('profile_no_requests')} />;

    const shown = showAll ? requests : requests.slice(0, PAGE);

    return (
        <div className="flex flex-col gap-3.5">
            <SectionHeading title={t('profile_requests_heading')} count={requests.length} action={seeAll} />
            <TableCard>
                <HeadRow grid={ROW_GRID}>
                    <div>{t('req_col_title')}</div>
                    <div className={WIDE_ONLY}>{t('req_col_type')}</div>
                    <div>{t('req_col_status')}</div>
                    <div className="text-center">{t('req_col_submitted')}</div>
                </HeadRow>
                {shown.map((r, i) => {
                    const type = REQUEST_TYPE_META[r.type];
                    const TypeIcon = type.icon;
                    const status = REQUEST_STATUS_META[r.status];
                    return (
                        <div key={r.id} className={cn(ROW_GRID, 'min-h-12 py-2', i > 0 && 'border-border/60 border-t')}>
                            <div className="flex min-w-0 items-center gap-2.5">
                                <div className="bg-accent text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                                    <TypeIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate text-xs font-medium">{requestTitle(r, t)}</span>
                                        {isOnBehalfRequest(r) && (
                                            <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone} dot={false} className="shrink-0">
                                                {t(REQUEST_ONBOARDING_BADGE.labelKey)}
                                            </StatusBadge>
                                        )}
                                    </div>
                                    <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{r.reference}</div>
                                </div>
                            </div>
                            <div className={cn('text-muted-foreground truncate text-xs', WIDE_ONLY)}>{t(type.labelKey)}</div>
                            <div className="min-w-0">
                                <StatusBadge tone={status.tone}>{t(status.labelKey)}</StatusBadge>
                            </div>
                            <div className="text-muted-foreground text-center text-xs font-semibold">{fmt.date(r.created_at)}</div>
                        </div>
                    );
                })}
                <ShowAllRow total={requests.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
            </TableCard>
        </div>
    );
}
