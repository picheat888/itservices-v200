import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { StatusBadge } from '@/shared/components/status-badge';
import { isOnBehalfRequest, REQUEST_APPROVE_BUTTON, REQUEST_ONBOARDING_BADGE, REQUEST_TYPE_META, requestTitle } from '@/shared/lib/request-meta';
import { cn } from '@/shared/lib/utils';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, Loader2, X } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useRequestMutations } from '../hooks/use-requests';

export type DecisionAction = 'approve' | 'reject';

/**
 * One line of the decision slip. dt/dd are direct children of the grid on the <dl>, so
 * the label column sizes itself to the longest label present and every value still lines
 * up — a fixed width had to be guessed, and "ต้องการซิม / แพ็กเกจดาต้า" wrapped onto two
 * lines at the width that suited the English labels.
 */
function SlipRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <>
            <dt className="text-muted-foreground pt-px text-xs">{label}</dt>
            <dd className="min-w-0 text-sm leading-relaxed">{children}</dd>
        </>
    );
}

/**
 * The approve / reject decision modal: a remark is required for reject
 * (bounced back to the requester), optional for approve. The hint box states
 * exactly who gets the next Bell + Email — per the workflow diagram.
 */
export function DecisionDialog({ request, action, onClose }: { request: ServiceRequest | null; action: DecisionAction | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { approve, reject } = useRequestMutations();

    const [shown, setShown] = useState<{ request: ServiceRequest; action: DecisionAction } | null>(null);
    useEffect(() => {
        if (request && action) setShown({ request, action });
    }, [request, action]);
    const ctx = request && action ? { request, action } : shown;

    const [note, setNote] = useState('');
    const [noteErr, setNoteErr] = useState('');
    useEffect(() => {
        setNote('');
        setNoteErr('');
    }, [request?.id, action]);

    if (!ctx) return null;
    const rejecting = ctx.action === 'reject';
    const remainingApprovals = (ctx.request.approvals ?? []).filter((a) => a.kind === 'approval' && a.status === 'waiting');
    const isFinal = remainingApprovals.length === 0;
    const pending = approve.isPending || reject.isPending;

    /**
     * "Step 2 of 3" — this rung's place in the approval chain, on the same base the list
     * row's progress bar uses: every approval rung, skipped ones included. The two are
     * read together (the dialog opens from that row), so a different denominator here
     * read as a contradiction — 1/3 in the row beside "Step 1 of 2" in the dialog.
     *
     * Counted by POSITION rather than from progress.done + 1: `done` also counts skipped
     * rungs, and a rung skipped further down the chain would push the number past where
     * this approver actually stands. The IT fulfilment row is not part of the count either
     * way — nobody signs it.
     */
    const rungs = (ctx.request.approvals ?? []).filter((a) => a.kind === 'approval');
    const stepIndex = rungs.findIndex((a) => a.status === 'current') + 1;
    const step = stepIndex > 0 ? t('req_decide_step').replace('{n}', String(stepIndex)).replace('{total}', String(rungs.length)) : null;

    const meta = REQUEST_TYPE_META[ctx.request.type];
    const onBehalf = isOnBehalfRequest(ctx.request);

    const submit = async () => {
        if (rejecting && !note.trim()) {
            setNoteErr(t('req_decide_note_required'));
            return;
        }
        try {
            if (rejecting) await reject.mutateAsync({ id: ctx.request.id, note: note.trim() });
            else await approve.mutateAsync({ id: ctx.request.id, note: note.trim() || undefined });
            onClose();
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            useToastStore.getState().push(msg ?? 'Something went wrong.', 'error');
        }
    };

    return (
        <Dialog open={!!request && !!action} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-[520px]">
                {/* Where the approver stands leads; the reference is filing information and
                    sits out of the way, in mono so it reads as a code rather than a sentence. */}
                {/* pr-7 keeps the reference clear of the dialog's own close button, which sits
                    in this same corner. */}
                <div className="flex items-start justify-between gap-3 pr-7">
                    <div>
                        <DialogTitle className="text-base font-bold">{rejecting ? t('req_decide_reject') : t('req_decide_approve')}</DialogTitle>
                        <DialogDescription className="mt-1.5 flex items-center gap-2 text-xs">
                            {/* One dot per rung that has to sign: filled behind you, ringed on
                                you, hollow ahead. Decoration for the sentence beside it, which
                                is why it is hidden from screen readers — "Step 1 of 2" already
                                says it in words. */}
                            {step && (
                                <span aria-hidden className="flex items-center gap-1">
                                    {rungs.map((rung, i) => (
                                        <Fragment key={rung.position}>
                                            {i > 0 && <span className="bg-border h-px w-2" />}
                                            <span
                                                className={cn(
                                                    'h-1.5 w-1.5 rounded-full',
                                                    rung.status === 'approved' && 'bg-emerald-500',
                                                    // Amber for a skipped rung, the colour the trail
                                                    // already uses for one — it also explains why the
                                                    // count can start above 1.
                                                    rung.status === 'skipped' && 'bg-amber-500/70',
                                                    rung.status === 'current' && 'bg-brand ring-brand/25 ring-2',
                                                    rung.status === 'waiting' && 'border-border bg-background border',
                                                )}
                                            />
                                        </Fragment>
                                    ))}
                                </span>
                            )}
                            {step ?? requestTitle(ctx.request, t)}
                        </DialogDescription>
                    </div>
                    <span className="text-muted-foreground shrink-0 font-mono text-xs">{ctx.request.reference}</span>
                </div>

                <div className="space-y-4">
                    {/* The decision itself, in the order an approver needs it: which service,
                        what exactly was asked for, who for, and why. The typed fields are the
                        part that was missing — "Mobile device" does not say whether it is a
                        phone with a SIM, and an approver should not have to open the request
                        to find out what they are committing to. */}
                    <div className="border-border space-y-3 rounded-lg border px-3.5 py-3">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase">
                                    <meta.icon className="h-3.5 w-3.5" />
                                    {t(meta.labelKey)}
                                </span>
                                {/* Same violet marker the list uses, so "this is for a new hire"
                                    reads identically wherever an approver meets it. */}
                                {onBehalf && <StatusBadge tone={REQUEST_ONBOARDING_BADGE.tone}>{t(REQUEST_ONBOARDING_BADGE.labelKey)}</StatusBadge>}
                            </div>
                            <p className="mt-1 text-sm font-semibold">{requestTitle(ctx.request, t)}</p>
                        </div>

                        <dl className="grid grid-cols-[minmax(96px,max-content)_1fr] gap-x-3 gap-y-1.5">
                            {ctx.request.fields_display.map((row) => (
                                <SlipRow key={row.key} label={lang === 'th' ? row.label_th : row.label_en}>
                                    <span className={cn(row.mono && 'font-mono text-xs')}>
                                        {lang === 'th' ? row.value_th || row.value : row.value}
                                    </span>
                                </SlipRow>
                            ))}
                            <SlipRow label={t('req_requester')}>{ctx.request.requester.name}</SlipRow>
                            {/* Its own row rather than a tail on the requester's name: whose budget
                                and headcount this lands on is a fact of its own, and an approver
                                often scans for it before the name. */}
                            {ctx.request.requester.department && <SlipRow label={t('req_department')}>{ctx.request.requester.department}</SlipRow>}
                            {/* Who to ask about it: a new hire has no account of their own yet, so
                                the person who filed it is the one who can answer for it. */}
                            {onBehalf && ctx.request.submitted_by?.name && (
                                <SlipRow label={t('req_submitted_by')}>{ctx.request.submitted_by.name}</SlipRow>
                            )}
                            {/* Readable size, not the smallest text in the box: the reason is what
                                the decision rests on. */}
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
                </div>

                {/* Only the one thing the approver cannot work out from the button they are
                    about to press: who this goes to next. Nothing is said on the last rung
                    or on a rejection — "the request closes" is what Reject means. */}
                <DialogFooter className="items-center gap-3 sm:gap-0">
                    {!rejecting && !isFinal && (
                        <p className="text-muted-foreground mr-auto text-xs leading-relaxed sm:pr-4">
                            {t('req_decide_notify_next').replace(
                                '{name}',
                                remainingApprovals[0]?.approver_name ?? remainingApprovals[0]?.label ?? '',
                            )}
                        </p>
                    )}
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant={rejecting ? 'destructive' : 'default'}
                        className={rejecting ? undefined : REQUEST_APPROVE_BUTTON}
                        onClick={submit}
                        disabled={pending}
                    >
                        {pending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : rejecting ? (
                            <X className="h-4 w-4" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                        {rejecting ? t('req_reject') : t('req_approve')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
