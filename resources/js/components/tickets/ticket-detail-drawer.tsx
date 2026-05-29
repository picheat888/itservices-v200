import { StatusBadge } from '@/components/shared/status-badge';
import { TicketCategoryIcon, TicketPriorityBadge, TicketStatusBadge } from '@/components/tickets/ticket-meta';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Ticket } from '@/types';
import { Check, RefreshCcw, Users, X, Zap } from 'lucide-react';
import type { ResolveMode } from './resolve-ticket-modal';

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

/** Read-only ticket detail with status-/role-aware footer actions. */
export function TicketDetailDrawer({
    ticket,
    onClose,
    isIT,
    isSuper,
    meId,
    onTake,
    onAssign,
    onResolve,
}: {
    ticket: Ticket | null;
    onClose: () => void;
    isIT: boolean;
    isSuper: boolean;
    meId: number | undefined;
    onTake: (t: Ticket) => void;
    onAssign: (t: Ticket) => void;
    onResolve: (t: Ticket, mode: ResolveMode) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (!ticket) return null;

    const subject = lang === 'th' && ticket.subject_th ? ticket.subject_th : ticket.subject;
    const isMine = ticket.assignee_id != null && ticket.assignee_id === meId;
    const isOpenUnassigned = ticket.status === 'open' && ticket.assignee_id == null;

    return (
        <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[600px] flex-col sm:max-w-[600px]">
                <SheetHeader>
                    <SheetTitle className="font-mono">{ticket.ticket_no}</SheetTitle>
                    <SheetDescription>{subject}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-5 overflow-y-auto px-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <TicketStatusBadge status={ticket.status} t={t} />
                        {ticket.priority ? (
                            <TicketPriorityBadge priority={ticket.priority} t={t} />
                        ) : (
                            <StatusBadge tone="gray">{t('ticket_no_priority')}</StatusBadge>
                        )}
                        <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium">
                            <TicketCategoryIcon category={ticket.category} className="h-3 w-3" />
                            {t(`ticket_cat_${ticket.category}`)}
                        </span>
                    </div>

                    <div className="text-lg font-bold tracking-tight">{subject}</div>

                    {isOpenUnassigned && isIT && (
                        <div className="bg-brand/10 text-brand flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm">
                            <Zap className="h-4 w-4 shrink-0" />
                            <span className="flex-1">{t('ticket_unassigned_hint')}</span>
                            <Button size="sm" onClick={() => onTake(ticket)}>
                                {t('ticket_take_case')}
                            </Button>
                        </div>
                    )}

                    {ticket.status === 'in_progress' && isMine && (
                        <div className="flex items-center gap-2.5 rounded-md bg-violet-500/10 px-3 py-2.5 text-sm text-violet-600 dark:text-violet-400">
                            <RefreshCcw className="h-4 w-4 shrink-0" />
                            <span>{t('ticket_working_hint')}</span>
                        </div>
                    )}

                    {ticket.description && <p className="bg-muted/50 rounded-md px-3 py-2.5 text-sm leading-relaxed">{ticket.description}</p>}

                    <div className="grid grid-cols-2 gap-4">
                        <KV label={t('ticket_requester')} value={ticket.requester_name ?? ticket.requester_code} mono={!ticket.requester_name} />
                        <KV
                            label={t('ticket_assignee')}
                            value={ticket.assignee_name ?? <span className="text-muted-foreground italic">{t('ticket_unassigned')}</span>}
                        />
                        <KV label={t('ticket_created')} value={ticket.created_at?.slice(0, 16).replace('T', ' ')} mono />
                        <KV label={t('ticket_updated')} value={ticket.updated_at?.slice(0, 16).replace('T', ' ')} mono />
                        {ticket.callback_phone && <KV label={t('ticket_callback_phone')} value={ticket.callback_phone} mono />}
                        {ticket.related_asset_tag && (
                            <KV label={t('ticket_related_asset')} value={`${ticket.related_asset_tag} — ${ticket.related_asset_model}`} mono />
                        )}
                    </div>

                    {ticket.take_note && (
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{t('ticket_take_note')}</div>
                            <p className="bg-muted/50 rounded-md px-3 py-2 text-sm leading-relaxed">{ticket.take_note}</p>
                        </div>
                    )}

                    {ticket.resolution && (
                        <div>
                            <div className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">{t('ticket_resolution')}</div>
                            <p
                                className={
                                    ticket.status === 'completed'
                                        ? 'rounded-md bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-700 dark:text-emerald-400'
                                        : 'text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm leading-relaxed'
                                }
                            >
                                {ticket.resolution}
                            </p>
                        </div>
                    )}
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {isIT && isOpenUnassigned && (
                        <>
                            {isSuper && (
                                <Button variant="outline" onClick={() => onAssign(ticket)}>
                                    <Users className="h-4 w-4" />
                                    {t('ticket_assign_to_staff')}
                                </Button>
                            )}
                            <Button onClick={() => onTake(ticket)}>
                                <Zap className="h-4 w-4" />
                                {t('ticket_take_case')}
                            </Button>
                        </>
                    )}
                    {ticket.status === 'in_progress' && isMine && (
                        <>
                            <Button variant="destructive" onClick={() => onResolve(ticket, 'cancel')}>
                                <X className="h-4 w-4" />
                                {t('ticket_mark_canceled')}
                            </Button>
                            <Button onClick={() => onResolve(ticket, 'complete')}>
                                <Check className="h-4 w-4" />
                                {t('ticket_mark_complete')}
                            </Button>
                        </>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
