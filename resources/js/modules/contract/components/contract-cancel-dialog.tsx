import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import type { Contract } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContractMutations } from '../hooks/use-contracts';

/** Cancel a contract with a required reason (reversible early termination). */
export function ContractCancelDialog({ contract, onClose, onDone }: { contract: Contract | null; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const { cancel } = useContractMutations();
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | undefined>();
    const [serverError, setServerError] = useState('');
    const [serverErrorCount, setServerErrorCount] = useState(0);
    // Kept through the exit animation so the name line doesn't vanish while closing
    const [shown, setShown] = useState<Contract | null>(contract);
    useEffect(() => {
        if (contract) setShown(contract);
    }, [contract]);
    // The open contract first: the kept copy only lands a render later, and the description must be there on open
    const named = contract ?? shown;

    // Reset the field each time a (different) contract opens the dialog.
    useEffect(() => {
        if (contract) {
            setReason('');
            setError(undefined);
            setServerError('');
        }
    }, [contract]);

    const guardClose = useDiscardGuard(!!contract && reason !== '');

    const submit = async () => {
        if (!reason.trim()) {
            setError(t('contract_cancel_reason_required'));
            return;
        }
        if (!contract) return;
        setServerError('');
        try {
            await cancel.mutateAsync({ id: contract.id, reason: reason.trim() });
            onDone();
        } catch {
            setServerError(t('contract_cancel_failed'));
            setServerErrorCount((n) => n + 1);
        }
    };

    return (
        <Dialog open={!!contract} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Ban}
                    eyebrow={named?.code}
                    title={t('contract_cancel_confirm_title')}
                    subtitle={named ? <span className="text-muted-foreground text-sm">{named.name}</span> : undefined}
                    srDescription={named ? `${named.name} ${named.code}` : undefined}
                />

                <DialogBody>
                    <FormErrorBanner message={serverError} shakeKey={serverErrorCount} />

                    <Field label={t('contract_cancel_reason')} required error={error}>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            autoFocus
                            placeholder={t('contract_cancel_reason_ph')}
                        />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={cancel.isPending}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
                        <Ban className="h-4 w-4" />
                        {t('contract_cancel')}
                    </Button>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
