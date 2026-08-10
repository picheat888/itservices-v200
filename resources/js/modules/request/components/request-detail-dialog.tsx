import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { useInitials } from '@/shared/hooks/use-initials';
import { useRecordView } from '@/shared/hooks/use-record-view';
import { isOnBehalfRequest, REQUEST_STATUS_META, REQUEST_TYPE_META } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, PackageCheck, Ticket as TicketIcon, Trash2, UserPlus, X, Zap } from 'lucide-react';
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
 *
 * Opening a second request from underneath this one (a deep link, a row behind
 * the dialog) swaps `requestId` while the dialog stays open. `useRecordView`
 * makes that swap honest: the body only ever renders the record whose id the
 * dialog is on, and the gap until it arrives is a skeleton inside the same
 * dialog frame — not the previous request's reference, title and approval trail.
 */
export function RequestDetailDialog({ requestId, onClose }: { requestId: number | null; onClose: () => void }) {
    const { data } = useRequest(requestId);
    const { record: request, switching } = useRecordView(requestId, data);

    const [decision, setDecision] = useState<DecisionAction | null>(null);
    // A decision belongs to the request it was opened on; switching requests drops it.
    useEffect(() => {
        setDecision(null);
    }, [requestId]);

    // Nothing to show and nothing on the way: the dialog is fully closed.
    if (!request && !switching) return null;

    return (
        <>
            <Dialog open={requestId != null} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="!flex max-h-[min(860px,calc(100vh-72px))] max-w-[980px] flex-col gap-0 overflow-hidden p-0">
                    {request ? <RequestDetailBody request={request} onClose={onClose} onDecide={setDecision} /> : <RequestDetailLoading />}
                </DialogContent>
            </Dialog>

            <DecisionDialog request={decision && request ? request : null} action={decision} onClose={() => setDecision(null)} />
        </>
    );
}

/** The dialog's own shape while the next request loads — same frame, no content claims. */
function RequestDetailLoading() {
    const t = useT();

    return (
        <div className="flex flex-col gap-0" aria-busy="true">
            <DialogTitle className="sr-only">{t('req_detail_eyebrow')}</DialogTitle>
            <DialogDescription className="sr-only">{t('req_detail_eyebrow')}</DialogDescription>

            {/* Header band: icon + two lines of text + a status pill on the right. */}
            <div className="flex items-center gap-3.5 px-6 pt-5 pb-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-2.5 w-40" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            <div className="border-border/60 grid gap-8 border-t px-6 py-6 md:grid-cols-[1.15fr_1fr]">
                <div className="space-y-5">
                    {/* Requester: badge photo on the left, four labelled fields beside it. */}
                    <div className="space-y-2">
                        <Skeleton className="h-2.5 w-20" />
                        <div className="flex items-stretch gap-4">
                            <Skeleton className="w-[68px] shrink-0 rounded-lg" />
                            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="space-y-1.5">
                                        <Skeleton className="h-2.5 w-20" />
                                        <Skeleton className="h-4 w-28" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-2.5 w-24" />
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
    );
}

/**
 * Everything the dialog shows for one request. Takes the record as a prop so it
 * cannot render without one — the loading case is the parent's problem, not a
 * set of `request?.` checks scattered through the body.
 */
function RequestDetailBody({
    request,
    onClose,
    onDecide,
}: {
    request: ServiceRequest;
    onClose: () => void;
    onDecide: (action: DecisionAction) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const navigate = useNavigate();
    const confirm = useConfirm();
    const { fulfill, cancel } = useRequestMutations();

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
            <FocusDialogHeader
                icon={meta.icon}
                accent={meta.color}
                eyebrow={`${t('req_detail_eyebrow')} · ${t(REQUEST_TYPE_META[request.type].labelKey)}`}
                title={request.title}
                code={request.reference}
                srDescription={request.title}
                headerRight={
                    <StatusBadge tone={REQUEST_STATUS_META[request.status].tone}>{t(REQUEST_STATUS_META[request.status].labelKey)}</StatusBadge>
                }
            />

            {/* Filed for somebody who could not file it themselves — the approver
                needs that before reading anything else on this request. */}
            {isOnBehalfRequest(request) && (
                <div className="flex items-start gap-2.5 border-t border-l-2 border-l-violet-500 bg-violet-500/[0.06] px-6 py-3">
                    <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    <div className="min-w-0 text-sm">
                        <div className="font-semibold text-violet-700 dark:text-violet-300">{t('req_onboarding_title')}</div>
                        <div className="text-muted-foreground text-xs">
                            {request.submitted_by?.name
                                ? `${t('req_submitted_by')} ${request.submitted_by.name} · ${request.created_at}`
                                : t('req_onboarding_desc')}
                        </div>
                    </div>
                </div>
            )}

            <div className="border-border/60 grid flex-1 gap-8 overflow-y-auto border-t px-6 py-6 md:grid-cols-[1.15fr_1fr]">
                {/* Left — summary + typed fields */}
                <div className="min-w-0 space-y-5">
                    <div>
                        <SectionLabel>{t('req_requester')}</SectionLabel>
                        <RequesterCard requester={request.requester} />
                    </div>

                    <div>
                        <SectionLabel>{t('req_reason_label')}</SectionLabel>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{request.reason}</p>
                    </div>

                    {/* Subject leads the table even though the header carries it too: this is
                        the row an approver reads the decision off, beside the detail it is a
                        decision about.

                        Rendered whether or not there are fields under it, because plenty of
                        requests have none — Recovery's schema is empty by design, and every
                        onboarding request filed before Step 3 started collecting the device
                        type has an empty snapshot. Hiding the table then hid the subject with
                        it. */}
                    <div>
                        <SectionLabel>{t('req_detail_section')}</SectionLabel>
                        <div className="border-border divide-border/70 divide-y rounded-xl border">
                            <div className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                                <span className="text-muted-foreground shrink-0 text-xs">{t('req_subject')}</span>
                                <span className="text-right font-medium break-all">{request.title}</span>
                            </div>
                            {request.fields_display.map((row) => (
                                <div key={row.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                                    <span className="text-muted-foreground shrink-0 text-xs">{lang === 'th' ? row.label_th : row.label_en}</span>
                                    <span className={cn('text-right font-medium break-all', row.mono && 'font-mono text-xs')}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

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
                            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDecide('reject')}>
                                <X className="h-4 w-4" />
                                {t('req_reject')}
                            </Button>
                            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onDecide('approve')}>
                                <Check className="h-4 w-4" />
                                {t('req_approve')}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

/**
 * Who is asking: the photo, then the same labelled fields the rest of the dialog
 * uses. Code / position / photo come off the live employee record, so a request
 * whose requester has no employee link shows the name and department that were
 * snapshotted at submit and a dash for the other two.
 */
function RequesterCard({ requester }: { requester: ServiceRequest['requester'] }) {
    const t = useT();
    const getInitials = useInitials();

    return (
        <div className="flex items-stretch gap-4">
            {/* Badge photo: a portrait tile, not a disc, and it stretches to the height
                of the fields beside it — so the block reads as one ID card instead of
                a circle floating in its own margin. Initials until somebody uploads. */}
            <div className="border-border bg-muted w-[68px] shrink-0 overflow-hidden rounded-lg border">
                {requester.photo_url ? (
                    <img src={requester.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-lg font-semibold">
                        {getInitials(requester.name || '?')}
                    </div>
                )}
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3.5">
                <KV label={t('req_requester_name')} value={requester.name} />
                <KV label={t('req_emp_code')} value={requester.code || '—'} mono />
                <KV label={t('position')} value={requester.position || '—'} />
                <KV label={t('department')} value={requester.department ?? '—'} />
            </div>
        </div>
    );
}

/** One labelled field: small uppercase label over its value. */
function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{label}</div>
            <div className={cn('mt-0.5 truncate text-sm font-medium', mono && 'font-mono text-sm')}>{value}</div>
        </div>
    );
}
