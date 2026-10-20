import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { serverMessage } from '@/shared/lib/api-errors';
import { localLabel, localName, localPair } from '@/shared/lib/local-name';
import { isOnBehalfRequest, REQUEST_APPROVE_BUTTON, REQUEST_ONBOARDING_BADGE, REQUEST_TYPE_META, requestTitle } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Check, CheckCircle2, X, XCircle } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useRequestMutations } from '../hooks/use-requests';

export type DecisionAction = 'approve' | 'reject';

/** One line of the decision slip; the label column sizes to the longest label. */
function SlipRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <dt className="text-muted-foreground pt-px text-xs">{label}</dt>
            <dd className="min-w-0 text-sm leading-relaxed">{children}</dd>
        </>
    );
}

/** Approve / reject modal: a remark is required to reject, optional to approve; the footer names who is notified next. */
export function DecisionDialog({ request, action, onClose }: { request: ServiceRequest | null; action: DecisionAction | null; onClose: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const { approve, reject } = useRequestMutations();

    const [shown, setShown] = useState<{ request: ServiceRequest; action: DecisionAction } | null>(null);
    useEffect(() => {
        if (request && action) setShown({ request, action });
    }, [request, action]);
    const ctx = request && action ? { request, action } : shown;

    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;
    useEffect(() => {
        setNote('');
        setNoteErr('');
        clearFormError();
    }, [request?.id, action, clearFormError]);
    const isOpen = !!request && !!action;
    const guardClose = useDiscardGuard(isOpen && note.trim() !== '');

    if (!ctx) return null;
    const rejecting = ctx.action === 'reject';
    const remainingApprovals = (ctx.request.approvals ?? []).filter((a) => a.kind === 'approval' && a.status === 'waiting');
    const isFinal = remainingApprovals.length === 0;
    const pending = approve.isPending || reject.isPending;

    // "Step 2 of 3": by position among the approval rungs (skipped ones included), as the row's progress ticks count.
    const rungs = (ctx.request.approvals ?? []).filter((a) => a.kind === 'approval');
    const stepIndex = rungs.findIndex((a) => a.status === 'current') + 1;
    const step = stepIndex > 0 ? t('req_decide_step').replace('{n}', fmtN(stepIndex)).replace('{total}', fmtN(rungs.length)) : null;

    const meta = REQUEST_TYPE_META[ctx.request.type];
    const onBehalf = isOnBehalfRequest(ctx.request);

    const submit = async () => {
        if (rejecting && !note.trim()) {
            setNoteErr(t('req_decide_note_required'));
            return;
        }
        formError.clear();
        try {
            if (rejecting) await reject.mutateAsync({ id: ctx.request.id, note: note.trim() });
            else await approve.mutateAsync({ id: ctx.request.id, note: note.trim() || undefined });
            onClose();
        } catch (e) {
            formError.show(serverMessage(e) ?? t('cd_error'));
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && !pending && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={rejecting ? XCircle : CheckCircle2}
                    tone={rejecting ? 'danger' : 'brand'}
                    eyebrow={ctx.request.reference}
                    title={rejecting ? t('req_decide_reject') : t('req_decide_approve')}
                    subtitle={
                        <span className="text-muted-foreground flex items-center gap-2 text-xs">
                            {/* One dot per rung (decorative; the sentence says it) */}
                            {step && (
                                <span aria-hidden className="flex items-center gap-1">
                                    {rungs.map((rung, i) => (
                                        <Fragment key={rung.position}>
                                            {i > 0 && <span className="bg-border h-px w-2" />}
                                            <span
                                                className={cn(
                                                    'h-1.5 w-1.5 rounded-full',
                                                    rung.status === 'approved' && 'bg-emerald-500',
                                                    rung.status === 'skipped' && 'bg-amber-500/70',
                                                    rung.status === 'current' && 'bg-brand ring-brand/25 ring-2',
                                                    rung.status === 'waiting' && 'border-border bg-background border',
                                                )}
                                            />
                                        </Fragment>
                                    ))}
                                </span>
                            )}
                            {step ?? requestTitle(ctx.request, t, lang)}
                        </span>
                    }
                    srDescription={step ?? requestTitle(ctx.request, t, lang)}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />

                    {/* The decision slip: service, what was asked for, who for and why */}
                    <div className="border-border space-y-3 rounded-lg border px-3.5 py-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase [&:lang(th)]:tracking-normal [&:lang(th)]:normal-case">
                                    <meta.icon className="h-3.5 w-3.5" />
                                    {t(meta.labelKey)}
                                </span>
                                {onBehalf && <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone}>{t(REQUEST_ONBOARDING_BADGE.labelKey)}</StatusBadge>}
                            </div>
                            <p className="mt-1 text-sm font-semibold">{requestTitle(ctx.request, t, lang)}</p>
                        </div>

                        <dl className="grid grid-cols-[minmax(96px,max-content)_1fr] gap-x-3 gap-y-1.5">
                            {ctx.request.fields_display.map((row) => (
                                <SlipRow key={row.key} label={localLabel(row, lang)}>
                                    <span>{localPair(row.value, row.value_th, lang)}</span>
                                </SlipRow>
                            ))}
                            <SlipRow label={t('req_requester')}>{localName(ctx.request.requester, lang)}</SlipRow>
                            {ctx.request.requester.department && (
                                <SlipRow label={t('req_department')}>
                                    {localPair(ctx.request.requester.department, ctx.request.requester.department_th, lang)}
                                </SlipRow>
                            )}
                            {/* A new hire has no account: the filer answers for it */}
                            {onBehalf && ctx.request.submitted_by?.name && (
                                <SlipRow label={t('req_submitted_by')}>
                                    {localPair(ctx.request.submitted_by.name, ctx.request.submitted_by.name_th, lang)}
                                </SlipRow>
                            )}
                            <SlipRow label={t('req_reason_label')}>
                                <span className="whitespace-pre-wrap">{ctx.request.reason}</span>
                            </SlipRow>
                        </dl>
                    </div>

                    <Field label={rejecting ? t('req_decide_note_reject') : t('req_decide_note')} required={rejecting} error={noteErr} name="note">
                        <Textarea
                            autoFocus
                            value={note}
                            onChange={(e) => {
                                setNote(e.target.value);
                                if (noteErr) setNoteErr('');
                            }}
                            placeholder={rejecting ? t('req_decide_note_ph_reject') : t('req_decide_note_ph_approve')}
                            className="min-h-[84px]"
                        />
                    </Field>
                </DialogBody>

                {/* Who is notified next (not on the last rung or a rejection) */}
                <DialogFooterBar>
                    {!rejecting && !isFinal && (
                        <p className="text-muted-foreground mr-auto text-xs leading-relaxed sm:pr-4">
                            {t('req_decide_notify_next').replace(
                                '{name}',
                                localPair(remainingApprovals[0]?.approver_name, remainingApprovals[0]?.approver_name_th, lang) ??
                                    remainingApprovals[0]?.label ??
                                    '',
                            )}
                        </p>
                    )}
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton
                        variant={rejecting ? 'destructive' : 'default'}
                        className={rejecting ? undefined : REQUEST_APPROVE_BUTTON}
                        onClick={submit}
                        loading={pending}
                    >
                        {rejecting ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {rejecting ? t('req_reject') : t('req_approve')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
