import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import type { Contract } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Ban } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useContractMutations } from '../hooks/use-contracts';

/** Cancel a contract with a required reason (reversible early termination). */
export function ContractCancelDialog({ contract, onClose, onDone }: { contract: Contract | null; onClose: () => void; onDone: () => void }) {
    const t = useT();
    const { cancel } = useContractMutations();
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | undefined>();

    // Reset the field each time a (different) contract opens the dialog.
    useEffect(() => {
        if (contract) {
            setReason('');
            setError(undefined);
        }
    }, [contract]);

    const submit = async () => {
        if (!reason.trim()) {
            setError(t('contract_cancel_reason_required'));
            return;
        }
        if (!contract) return;
        try {
            await cancel.mutateAsync({ id: contract.id, reason: reason.trim() });
            onDone();
        } catch {
            setError(t('contract_cancel_failed'));
        }
    };

    return (
        <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Ban className="text-destructive h-5 w-5" />
                        {t('contract_cancel_confirm_title')}
                    </DialogTitle>
                    {contract && (
                        <DialogDescription>
                            {contract.name} · {contract.code}
                        </DialogDescription>
                    )}
                </DialogHeader>

                <Field label={t('contract_cancel_reason')} required error={error}>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={t('contract_cancel_reason_ph')}
                        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                    />
                </Field>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={cancel.isPending}>
                        {t('cancel')}
                    </Button>
                    <Button variant="destructive" onClick={submit} disabled={cancel.isPending}>
                        <Ban className="h-4 w-4" />
                        {t('contract_cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
