import { useT } from '@/lang';
import { useAuth } from '@/modules/auth';
import { AttachmentPreview } from '@/shared/components/attachment-preview';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { EmptyState } from '@/shared/components/empty-state';
import { AttachmentRow } from '@/shared/components/file-drop-zone';
import { RecordMissing, recordMissingContentClass } from '@/shared/components/record-missing';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useInitials } from '@/shared/hooks/use-initials';
import { useRecordView } from '@/shared/hooks/use-record-view';
import { serverMessage } from '@/shared/lib/api-errors';
import { localLabel, localName, localPair } from '@/shared/lib/local-name';
import {
    isOnBehalfRequest,
    REQUEST_APPROVE_BUTTON,
    REQUEST_REJECT_BUTTON,
    REQUEST_STATUS_META,
    REQUEST_TYPE_META,
    requestTitle,
} from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { RequestAttachment, ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { useUiStore } from '@/stores/ui';
import { Ban, Check, PackageCheck, Ticket as TicketIcon, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRequest, useRequestMutations } from '../hooks/use-requests';
import { CancelRequestDialog } from './cancel-request-dialog';
import { DecisionDialog, type DecisionAction } from './decision-dialog';
import { RequestTrail } from './request-trail';

/**
 * One request: summary and fields on the left, the approval trail on the right, viewer-relative actions in the footer.
 * Deep-linked via /requests?view=<id>; useRecordView shows a skeleton, never the previous request, while switching.
 */
export function RequestDetailDialog({ requestId, onClose }: { requestId: number | null; onClose: () => void }) {
    const { data, isError } = useRequest(requestId);
    const { record: request, switching } = useRecordView(requestId, data);

    const [decision, setDecision] = useState<DecisionAction | null>(null);
    const [cancelling, setCancelling] = useState(false);
    // File viewer, rendered beside the dialog so the two never nest.
    const [preview, setPreview] = useState<RequestAttachment | null>(null);
    // A decision belongs to the request it was opened on; switching requests drops it.
    useEffect(() => {
        setDecision(null);
        setCancelling(false);
        setPreview(null);
    }, [requestId]);

    // Nothing to show and nothing on the way: the dialog is fully closed.
    if (!request && !switching) return null;

    return (
        <>
            <Dialog open={requestId != null} onOpenChange={(o) => !o && onClose()}>
                <DialogContent
                    className={cn(
                        '!flex h-[min(860px,calc(100dvh-72px))] w-[calc(100vw-2rem)] max-w-[980px] flex-col gap-0 overflow-hidden p-0',
                        isError && !request && recordMissingContentClass,
                    )}
                >
                    {request ? (
                        <RequestDetailBody
                            request={request}
                            onClose={onClose}
                            onDecide={setDecision}
                            onCancel={() => setCancelling(true)}
                            onPreview={setPreview}
                        />
                    ) : isError ? (
                        // Deleted, or not readable by this account
                        <RecordMissing onClose={onClose} />
                    ) : (
                        <RequestDetailLoading />
                    )}
                </DialogContent>
            </Dialog>

            <DecisionDialog request={decision && request ? request : null} action={decision} onClose={() => setDecision(null)} />
            <CancelRequestDialog
                request={cancelling && request ? request : null}
                onClose={() => setCancelling(false)}
                onCancelled={() => {
                    setCancelling(false);
                    onClose();
                }}
            />

            {/* Attachment viewer — images zoom/pan, PDFs embed, the rest show a file card. */}
            <AttachmentPreview file={preview} onClose={() => setPreview(null)} />
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

/** Everything the dialog shows for one loaded request. */
function RequestDetailBody({
    request,
    onClose,
    onDecide,
    onCancel,
    onPreview,
}: {
    request: ServiceRequest;
    onClose: () => void;
    onDecide: (action: DecisionAction) => void;
    onCancel: () => void;
    onPreview: (attachment: RequestAttachment) => void;
}) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { can } = useAuth();
    const { complete } = useRequestMutations();

    const meta = REQUEST_TYPE_META[request.type];
    // From `type` in the reader's language; `request.title` is the server's English subject.
    const shownTitle = requestTitle(request, t, lang);

    // IT sees why Complete is missing: the linked case is still open.
    const caseInFlight = request.ticket?.status === 'open' || request.ticket?.status === 'in_progress';
    const awaitingCase = caseInFlight && request.status === 'approved' && can('requests.complete');

    const confirmComplete = () =>
        confirm({
            variant: 'edit',
            title: t('req_complete_title'),
            description: t('req_complete_hint'),
            entity: { name: `${request.reference} - ${shownTitle}` },
            confirmText: t('req_complete'),
            action: () => complete.mutateAsync(request.id),
            errorMessage: serverMessage,
        });

    return (
        <>
            <FocusDialogHeader
                icon={meta.icon}
                accent={meta.color}
                eyebrow={`${t('req_detail_eyebrow')}: ${t(REQUEST_TYPE_META[request.type].labelKey)}`}
                title={shownTitle}
                code={request.reference}
                srDescription={shownTitle}
                headerRight={
                    <StatusBadge tone={REQUEST_STATUS_META[request.status].tone}>{t(REQUEST_STATUS_META[request.status].labelKey)}</StatusBadge>
                }
            />

            {/* Filed on behalf of a new hire */}
            {isOnBehalfRequest(request) && (
                <div className="flex items-start gap-2.5 border-t border-l-2 border-l-violet-500 bg-violet-500/[0.06] px-6 py-3">
                    <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                    <div className="min-w-0 text-sm">
                        <div className="font-semibold text-violet-700 dark:text-violet-300">{t('req_onboarding_title')}</div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-3 text-xs">
                            {request.submitted_by?.name ? (
                                <>
                                    <span>
                                        {t('req_submitted_by')} {localPair(request.submitted_by.name, request.submitted_by.name_th, lang)}
                                    </span>
                                    <span>{fmt.dateTime(request.created_at)}</span>
                                </>
                            ) : (
                                t('req_onboarding_desc')
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="border-border/60 grid flex-1 content-start gap-8 overflow-y-auto border-t px-6 py-6 md:grid-cols-[1.15fr_1fr]">
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

                    {/* Request detail — always shown, the subject row leads even when there are no fields */}
                    <div>
                        <SectionLabel>{t('req_detail_section')}</SectionLabel>
                        <div className="border-border divide-border/70 divide-y rounded-xl border">
                            <div className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                                <span className="text-muted-foreground shrink-0 text-xs">{t('req_subject')}</span>
                                <span className="text-right font-medium break-all">{shownTitle}</span>
                            </div>
                            {request.fields_display.map((row) => (
                                <div key={row.key} className="flex items-baseline justify-between gap-4 px-3.5 py-2 text-sm">
                                    <span className="text-muted-foreground shrink-0 text-xs">{localLabel(row, lang)}</span>
                                    <span className={'text-right font-medium break-all'}>{localPair(row.value, row.value_th, lang)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <SectionLabel>{t('req_attach_section')}</SectionLabel>
                        <RequestAttachments request={request} onPreview={onPreview} />
                    </div>

                    {/* Linked ticket */}
                    <div>
                        <SectionLabel>{t('req_linked_ticket')}</SectionLabel>
                        {request.ticket ? (
                            <Link
                                to={`/tickets?view=${request.ticket.id}`}
                                className="border-border hover:border-brand/50 flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors"
                            >
                                <span className="bg-brand/10 text-brand flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                    <TicketIcon className="h-4.5 w-4.5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-bold">{request.ticket.ticket_no}</span>
                                    <span className="text-muted-foreground block text-xs">{t('req_ticket_auto_hint')}</span>
                                </span>
                            </Link>
                        ) : (
                            <EmptyState
                                className="border-border/80 rounded-xl border border-dashed"
                                title={request.auto_ticket && request.status === 'pending' ? t('req_auto_ticket_note') : t('req_no_ticket')}
                            />
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
                {awaitingCase && request.ticket && (
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <TicketIcon className="h-3.5 w-3.5 shrink-0" />
                        {t('req_complete_awaits_case').replace('{no}', request.ticket.ticket_no)}
                    </span>
                )}
                {request.can_cancel && (
                    <Button variant="destructive" onClick={onCancel}>
                        <Ban className="h-4 w-4" />
                        {t('req_cancel_request')}
                    </Button>
                )}
                <div className="ml-auto flex items-center gap-2.5">
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {request.can_complete && (
                        <Button onClick={confirmComplete} disabled={complete.isPending}>
                            <PackageCheck className="h-4 w-4" />
                            {t('req_complete')}
                        </Button>
                    )}
                    {request.can_approve && (
                        <>
                            <Button variant="outline" className={REQUEST_REJECT_BUTTON} onClick={() => onDecide('reject')}>
                                <X className="h-4 w-4" />
                                {t('req_reject')}
                            </Button>
                            <Button className={REQUEST_APPROVE_BUTTON} onClick={() => onDecide('approve')}>
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

/** The files filed with the request, read-only (fixed at submit). */
function RequestAttachments({ request, onPreview }: { request: ServiceRequest; onPreview: (attachment: RequestAttachment) => void }) {
    const t = useT();
    const attachments = request.attachments ?? [];

    if (attachments.length === 0) {
        return (
            <EmptyState
                className="border-border/80 rounded-xl border border-dashed"
                title={t('req_empty_detail_attachments')}
                hint={t('req_empty_detail_attachments_hint')}
            />
        );
    }

    return (
        <div className="border-border rounded-xl border px-3.5 py-1">
            {attachments.map((a) => (
                <AttachmentRow key={a.id} name={a.name} size={a.size} mime={a.mime} href={a.url} onPreview={() => onPreview(a)} />
            ))}
        </div>
    );
}

/** Who is asking: photo plus code, position and department (dashes when there is no employee link). */
function RequesterCard({ requester }: { requester: ServiceRequest['requester'] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const getInitials = useInitials();

    return (
        <div className="flex items-stretch gap-4">
            {/* Badge photo, initials until one is uploaded */}
            <div className="border-border bg-muted w-[68px] shrink-0 overflow-hidden rounded-lg border">
                {requester.photo_url ? (
                    <img src={requester.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="text-foreground/65 dark:text-muted-foreground flex h-full items-center justify-center text-lg font-semibold">
                        {getInitials(requester.name || '?')}
                    </div>
                )}
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3.5">
                <KV label={t('req_requester_name')} value={localName(requester, lang)} />
                <KV label={t('req_emp_code')} value={requester.code || '—'} />
                <KV label={t('position')} value={requester.position || '—'} />
                <KV label={t('department')} value={localPair(requester.department, requester.department_th, lang) ?? '—'} />
            </div>
        </div>
    );
}

/** One labelled field: small uppercase label over its value. */
function KV({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase [&:lang(th)]:tracking-normal [&:lang(th)]:normal-case">
                {label}
            </div>
            <div className={'mt-0.5 truncate text-sm font-medium'}>{value}</div>
        </div>
    );
}
