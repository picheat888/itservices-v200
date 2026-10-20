/**
 * Withdraw a pending request: the requester (or the HR filer) must say why, like an IT "not delivered" close.
 */
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { serverMessage } from '@/shared/lib/api-errors';
import { requestTitle } from '@/shared/lib/request-meta';
import type { ServiceRequest } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Ban, XCircle } from 'lucide-react';
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
    const lang = useUiStore((s) => s.lang);
    const { cancel } = useRequestMutations();

    // Keep the last request so the content stays during the close animation
    const [shown, setShown] = useState<ServiceRequest | null>(null);
    useEffect(() => {
        if (request) setShown(request);
    }, [request]);

    const [reason, setReason] = useState('');
    const [reasonErr, setReasonErr] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;
    useEffect(() => {
        setReason('');
        setReasonErr('');
        clearFormError();
    }, [request?.id, clearFormError]);

    const isOpen = !!request;
    const guardClose = useDiscardGuard(isOpen && reason.trim() !== '');
    const ctx = request ?? shown;
    if (!ctx) return null;

    const submit = async () => {
        if (!reason.trim()) {
            setReasonErr(t('req_cancel_reason_required'));
            return;
        }
        formError.clear();
        try {
            await cancel.mutateAsync({ id: ctx.id, reason: reason.trim() });
            onCancelled();
        } catch (e) {
            formError.show(serverMessage(e) ?? t('cd_error'));
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && !cancel.isPending && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={XCircle}
                    tone="danger"
                    eyebrow={ctx.reference}
                    title={t('req_cancel_title')}
                    subtitle={<span className="text-muted-foreground text-sm">{t('req_cancel_hint')}</span>}
                    srDescription={t('req_cancel_hint')}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <p className="border-border rounded-lg border px-3.5 py-2.5 text-sm font-semibold">{requestTitle(ctx, t, lang)}</p>
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
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={cancel.isPending}>
                        {t('req_cancel_keep')}
                    </Button>
                    <SaveButton variant="destructive" onClick={submit} loading={cancel.isPending}>
                        <Ban className="h-4 w-4" />
                        {t('req_cancel_request')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
