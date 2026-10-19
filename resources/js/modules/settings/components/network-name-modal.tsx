// Add or edit one network name (IP or range + name); saves on its own and shows the server's refusal under the field it names.
import { useT } from '@/lang';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { fieldError, hasFieldError, serverMessage } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { NetworkName } from '../api/settingsApi';
import { useNetworkNameMutations } from '../hooks/use-network-names';

export function NetworkNameModal({ open, network, onClose }: { open: boolean; network: NetworkName | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useNetworkNameMutations();
    const [cidr, setCidr] = useState('');
    const [name, setName] = useState('');
    const [cidrError, setCidrError] = useState<string | undefined>();
    const [nameError, setNameError] = useState<string | undefined>();
    const [saved, setSaved] = useState(false);
    const formError = useFormError();
    const clearFormError = formError.clear;
    const cidrRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setCidr(network?.cidr ?? '');
            setName(network?.name ?? '');
            setCidrError(undefined);
            setNameError(undefined);
            setSaved(false);
            clearFormError();
        }
    }, [open, network, clearFormError]);

    // Dirty = differs from the values the dialog was seeded with (create = blank).
    const isDirty = !saved && (cidr !== (network?.cidr ?? '') || name !== (network?.name ?? ''));
    const guardClose = useDiscardGuard(open && isDirty);

    const submit = async () => {
        if (saving || saved) {
            return;
        }
        formError.clear();
        const missingCidr = !cidr.trim();
        const missingName = !name.trim();
        setCidrError(missingCidr ? t('set_err_required') : undefined);
        setNameError(missingName ? t('set_err_required') : undefined);
        if (missingCidr || missingName) {
            (missingCidr ? cidrRef : nameRef).current?.focus();
            return;
        }
        const payload = { cidr: cidr.trim(), name: name.trim() };
        try {
            if (network) {
                await update.mutateAsync({ id: network.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setSaved(true);
            closeAfterSave();
        } catch (err) {
            if (hasFieldError(err, 'cidr') || hasFieldError(err, 'name')) {
                setCidrError(fieldError(err, 'cidr'));
                setNameError(fieldError(err, 'name'));
                (hasFieldError(err, 'cidr') ? cidrRef : nameRef).current?.focus();
            } else {
                formError.show(serverMessage(err) ?? t('cd_error'));
            }
        }
    };

    const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            submit();
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{network ? t('net_edit_title') : t('net_add_title')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                <div className="space-y-3">
                    <Field label={t('net_col_cidr')} required error={cidrError}>
                        <Input
                            ref={cidrRef}
                            autoComplete="off"
                            spellCheck={false}
                            value={cidr}
                            onChange={(e) => {
                                setCidr(e.target.value);
                                setCidrError(undefined);
                            }}
                            autoFocus
                            maxLength={64}
                            placeholder={t('net_cidr_ph')}
                            onKeyDown={onEnter}
                        />
                    </Field>
                    <Field label={t('net_col_name')} required error={nameError}>
                        <Input
                            ref={nameRef}
                            autoComplete="off"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setNameError(undefined);
                            }}
                            maxLength={100}
                            placeholder={t('net_name_ph')}
                            onKeyDown={onEnter}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
