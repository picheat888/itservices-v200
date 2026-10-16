/**
 * Withdraw a pending request: the requester (or the HR filer) must say why, like an IT "not delivered" close.
 */
import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { serverMessage } from '@/shared/lib/api-errors';
import { requestTitle } from '@/shared/lib/request-meta';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Ban, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRequestMutations } from '../hooks/use-requests';

export function CancelRequestDialog({
    request,
    onClose,
    onCancelled,
}: {
    request: ServiceRequest | null;
    onClose: () => void;
    onCancelled: () => void;
}) {
    const t = useT();
    const { cancel } = useRequestMutations();

    // Keep the last request so the content stays during the close animation
    const [shown, setShown] = useState<ServiceRequest | null>(null);
    useEffect(() => {
        if (request) setShown(request);
    }, [request]);

    const [reason, setReason] = useState('');
    const [reasonErr, setReasonErr] = useState('');
    const [formError, setFormError] = useState('');
    useEffect(() => {
        setReason('');
        setReasonErr('');
        setFormError('');
    }, [request?.id]);

    const isOpen = !!request;
    const guardClose = useDiscardGuard(isOpen && reason.trim() !== '');
    const ctx = request ?? shown;
    if (!ctx) return null;

    const submit = async () => {
        if (!reason.trim()) {
            setReasonErr(t('req_cancel_reason_required'));
            return;
        }
        setFormError('');
        try {
            await cancel.mutateAsync({ id: ctx.id, reason: reason.trim() });
            onCancelled();
        } catch (e) {
            setFormError(serverMessage(e) ?? t('cd_error'));
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && !cancel.isPending && guardClose(onClose)}>
            <DialogContent className="max-w-[480px]">
                {/* Header — pr-7 keeps the reference clear of the close button */}
                <div className="flex items-start justify-between gap-3 pr-7">
                    <div>
                        <DialogTitle className="text-base font-bold">{t('req_cancel_title')}</DialogTitle>
                        <DialogDescription className="mt-1.5 text-xs">{t('req_cancel_hint')}</DialogDescription>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-xs">{ctx.reference}</span>
                </div>

                <div className="space-y-4">
                    {formError && (
                        <div
                            key={formError}
                            role="alert"
                            className="bg-destructive/10 dark:text-destructive animate-shake rounded-lg px-3.5 py-2.5 text-sm text-red-700"
                        >
                            {formError}
                        </div>
                    )}
                    <p className="border-border rounded-lg border px-3.5 py-2.5 text-sm font-semibold">{requestTitle(ctx, t)}</p>
                    <Field label={t('req_cancel_reason')} required error={reasonErr} name="cancel_reason">
                        <Textarea
                            autoFocus
                            value={reason}
                            maxLength={2000}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (reasonErr) setReasonErr('');
                            }}
                            placeholder={t('req_cancel_reason_ph')}
                            className="min-h-[84px]"
                        />
                    </Field>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={cancel.isPending}>
                        {t('req_cancel_keep')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
                        {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                        {t('req_cancel_request')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
