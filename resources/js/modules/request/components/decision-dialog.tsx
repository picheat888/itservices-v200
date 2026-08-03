import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { Bell, Check, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRequestMutations } from '../hooks/use-requests';

export type DecisionAction = 'approve' | 'reject';

/**
 * The approve / reject decision modal: a remark is required for reject
 * (bounced back to the requester), optional for approve. The hint box states
 * exactly who gets the next Bell + Email — per the workflow diagram.
 */
export function DecisionDialog({ request, action, onClose }: { request: ServiceRequest | null; action: DecisionAction | null; onClose: () => void }) {
    const t = useT();
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
    const current = (ctx.request.approvals ?? []).find((a) => a.status === 'current');
    const remainingApprovals = (ctx.request.approvals ?? []).filter((a) => a.kind === 'approval' && a.status === 'waiting');
    const isFinal = remainingApprovals.length === 0;
    const pending = approve.isPending || reject.isPending;

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
                <div>
                    <DialogTitle className="text-base font-bold">{rejecting ? t('req_decide_reject') : t('req_decide_approve')}</DialogTitle>
                    <DialogDescription className="mt-1 font-mono text-xs">
                        {ctx.request.reference}
                        {current ? ` · ${current.label}` : ''}
                    </DialogDescription>
                </div>

                <div className="space-y-4">
                    {/* The reason is what a decision rests on — an approver must not have to
                        open the request to read it. */}
                    <div className="border-border rounded-lg border px-3.5 py-3">
                        <p className="text-sm font-semibold">{ctx.request.title}</p>
                        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed whitespace-pre-wrap">{ctx.request.reason}</p>
                        <p className="text-muted-foreground mt-2 text-xs">
                            {ctx.request.requester.name}
                            {ctx.request.requester.department ? ` · ${ctx.request.requester.department}` : ''}
                        </p>
                    </div>

                    <Field label={t('req_decide_note')} required={rejecting} error={noteErr} name="note">
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

                    <div className="border-border text-muted-foreground flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-relaxed">
                        <Bell className={rejecting ? 'text-destructive h-4 w-4 shrink-0' : 'text-brand h-4 w-4 shrink-0'} />
                        <span>
                            {rejecting
                                ? t('req_decide_notify_reject')
                                : isFinal
                                  ? t('req_decide_notify_final')
                                  : `${t('req_decide_notify_next')} ${remainingApprovals[0]?.approver_name ?? remainingApprovals[0]?.label ?? ''}`}
                        </span>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={pending}>
                        {t('cancel')}
                    </Button>
                    <Button
                        variant={rejecting ? 'destructive' : 'default'}
                        className={rejecting ? undefined : 'bg-emerald-600 text-white hover:bg-emerald-700'}
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
