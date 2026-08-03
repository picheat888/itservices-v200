import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { REQUEST_STATUS_META, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, PackageCheck, Ticket as TicketIcon, Trash2, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequest, useRequestMutations } from '../hooks/use-requests';
import { DecisionDialog, type DecisionAction } from './decision-dialog';
import { RequestTrail } from './request-trail';

/**
 * Focus dialog for one request: summary + typed fields on the left, the
 * approval trail on the right, and viewer-relative actions in the footer
 * (approve/reject for the resolved current approver, fulfill for IT, cancel
 * for the requester while pending). Deep-linked via /requests?view=<id>.
 */
export function RequestDetailDialog({ requestId, onClose }: { requestId: number | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const navigate = useNavigate();
    const confirm = useConfirm();
    const { data } = useRequest(requestId);
    const { fulfill, cancel } = useRequestMutations();

    // Retain the shown request through the exit animation.
    const [shown, setShown] = useState<ServiceRequest | null>(null);
    useEffect(() => {
        if (data) setShown(data);
    }, [data]);
    const request = requestId != null ? (data ?? shown) : shown;

    const [decision, setDecision] = useState<DecisionAction | null>(null);

    if (!request) return null;
    const meta = REQUEST_TYPE_META[request.type];

    const onError = (e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
    };

    const confirmFulfill = () =>
        confirm({
            variant: 'edit',
            title: t('req_fulfill_title'),
            description: t('req_fulfill_hint'),
            entity: { name: `${request.reference} — ${request.title}` },
            confirmText: t('req_fulfill'),
            action: () => fulfill.mutateAsync(request.id).catch(onError),
        });

    const confirmCancel = () =>
        confirm({
            variant: 'danger',
            title: t('req_cancel_title'),
            description: t('req_cancel_hint'),
            entity: { name: `${request.reference} — ${request.title}` },
            confirmText: t('req_cancel_request'),
            action: async () => {
                await cancel.mutateAsync(request.id).catch(onError);
                onClose();
            },
        });

    return (
        <>
            <Dialog open={requestId != null} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="!flex max-h-[min(860px,calc(100vh-72px))] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
                    <FocusDialogHeader
                        icon={meta.icon}
                        accent={meta.color}
                        eyebrow={`${t('req_detail_eyebrow')} · ${t(REQUEST_TYPE_META[request.type].labelKey)}`}
                        title={request.title}
                        code={request.reference}
                        srDescription={request.title}
                        headerRight={
                            <StatusBadge tone={REQUEST_STATUS_META[request.status].tone}>
                                {t(REQUEST_STATUS_META[request.status].labelKey)}
                            </StatusBadge>
                        }
                    />

                    <div className="border-border/60 grid flex-1 gap-8 overflow-y-auto border-t px-6 py-6 md:grid-cols-[1.15fr_1fr]">
                        {/* Left — summary + typed fields */}
                        <div className="min-w-0 space-y-5">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                                <KV label={t('req_requester')} value={request.requester.name} />
                                <KV label={t('req_department')} value={request.requester.department ?? '—'} />
                                <KV label={t('req_created')} value={request.created_at} mono />
                            </div>

                            <div>
                                <SectionLabel>{t('req_reason_label')}</SectionLabel>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{request.reason}</p>
                            </div>

                            {request.fields_display.length > 0 && (
                                <div>
                                    <SectionLabel>{t('req_service_section')}</SectionLabel>
                                    <div className="border-border divide-border/70 divide-y rounded-xl border">
                                        {request.fields_display.map((row) => (
                                            <div key={row.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                                                <span className="text-muted-foreground shrink-0 text-xs">
                                                    {lang === 'th' ? row.label_th : row.label_en}
                                                </span>
                                                <span className={cn('text-right font-medium break-all', row.mono && 'font-mono text-xs')}>
                                                    {row.value}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Linked ticket */}
                            <div>
                                <SectionLabel>{t('req_linked_ticket')}</SectionLabel>
                                {request.ticket ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/tickets?view=${request.ticket?.id}`)}
                                        className="border-border hover:border-brand/50 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors"
                                    >
                                        <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                            <TicketIcon className="h-4.5 w-4.5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-mono text-sm font-bold">{request.ticket.ticket_no}</span>
                                            <span className="text-muted-foreground block text-xs">{t('req_ticket_auto_hint')}</span>
                                        </span>
                                    </button>
                                ) : (
                                    <div className="border-border/80 text-muted-foreground flex items-center gap-2.5 rounded-xl border border-dashed px-3.5 py-3 text-xs">
                                        <Zap className="h-4 w-4 shrink-0" />
                                        {request.auto_ticket && request.status === 'pending' ? t('req_auto_ticket_note') : t('req_no_ticket')}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right — the approval trail */}
                        <div className="min-w-0">
                            <SectionLabel>{t('req_trail_title')}</SectionLabel>
                            <RequestTrail request={request} />
                        </div>
                    </div>

                    {/* Footer — viewer-relative actions */}
                    <div className="border-border/60 bg-muted/30 flex items-center gap-2.5 border-t px-6 py-3.5">
                        {request.can_cancel && (
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={confirmCancel}>
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('req_cancel_request')}
                            </Button>
                        )}
                        <div className="ml-auto flex items-center gap-2.5">
                            <Button variant="outline" onClick={onClose}>
                                {t('close')}
                            </Button>
                            {request.can_fulfill && (
                                <Button onClick={confirmFulfill} disabled={fulfill.isPending}>
                                    <PackageCheck className="h-4 w-4" />
                                    {t('req_fulfill')}
                                </Button>
                            )}
                            {request.can_approve && (
                                <>
                                    <Button
                                        variant="outline"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => setDecision('reject')}
                                    >
                                        <X className="h-4 w-4" />
                                        {t('req_reject')}
                                    </Button>
                                    <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setDecision('approve')}>
                                        <Check className="h-4 w-4" />
                                        {t('req_approve')}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <DecisionDialog request={decision ? request : null} action={decision} onClose={() => setDecision(null)} />
        </>
    );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{label}</div>
            <div className={cn('mt-0.5 truncate text-sm font-medium', mono && 'font-mono text-sm')}>{value}</div>
        </div>
    );
}
