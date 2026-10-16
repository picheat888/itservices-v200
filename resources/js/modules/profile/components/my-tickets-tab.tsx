// My Profile drawer, Tickets tab: the tickets this person opened, in the Assets tab's table style.
import { useT } from '@/lang';
import { TicketCategoryIcon, TicketStatusBadge } from '@/modules/ticket';
import { EmptyPane } from '@/shared/components/empty-pane';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { cn } from '@/shared/lib/utils';
import type { Ticket } from '@/shared/types';
import { Ticket as TicketIcon } from 'lucide-react';
import { useState } from 'react';
import { HeadRow, LoadingRows, PAGE, SectionHeading, ShowAllRow, TableCard } from './profile-table';

type Row = Pick<Ticket, 'id' | 'ticket_no' | 'subject' | 'category' | 'status' | 'created_at'>;

const ROW_GRID =
    'grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-center gap-3 px-4';
const WIDE_ONLY = 'hidden lg:block';

export function MyTicketsTab({ tickets, loading, seeAll }: { tickets: Row[]; loading: boolean; seeAll?: React.ReactNode }) {
    const t = useT();
    const fmt = useDateFormat();
    const [showAll, setShowAll] = useState(false);

    if (loading) return <LoadingRows />;
    if (tickets.length === 0) return <EmptyPane icon={TicketIcon} text={t('profile_no_tickets')} />;

    const shown = showAll ? tickets : tickets.slice(0, PAGE);

    return (
        <div className="flex flex-col gap-3.5">
            <SectionHeading title={t('profile_tickets_heading')} count={tickets.length} action={seeAll} />
            <TableCard>
                <HeadRow grid={ROW_GRID}>
                    <div>{t('ticket_subject')}</div>
                    <div className={WIDE_ONLY}>{t('ticket_category')}</div>
                    <div>{t('status')}</div>
                    <div className="text-center">{t('ticket_request_at')}</div>
                </HeadRow>
                {shown.map((tk, i) => (
                    <div key={tk.id} className={cn(ROW_GRID, 'min-h-12 py-2', i > 0 && 'border-border/60 border-t')}>
                        <div className="flex min-w-0 items-center gap-2.5">
                            <div className="bg-accent text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                                <TicketCategoryIcon category={tk.category} className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-xs font-medium">{tk.subject}</div>
                                <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{tk.ticket_no}</div>
                            </div>
                        </div>
                        <div className={cn('text-muted-foreground truncate text-xs', WIDE_ONLY)}>{t(`ticket_cat_${tk.category}`)}</div>
                        <div className="min-w-0">
                            <TicketStatusBadge status={tk.status} t={t} />
                        </div>
                        <div className="text-muted-foreground text-center text-xs font-semibold">{fmt.date(tk.created_at)}</div>
                    </div>
                ))}
                <ShowAllRow total={tickets.length} expanded={showAll} onToggle={() => setShowAll((v) => !v)} />
            </TableCard>
        </div>
    );
}
