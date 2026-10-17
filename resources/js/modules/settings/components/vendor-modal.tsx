import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { hasFieldError } from '@/shared/lib/api-errors';
import { localName } from '@/shared/lib/local-name';
import type { Vendor } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useVendorMutations } from '../hooks/use-master-data';

const emptyForm = { name: '', name_th: '', contact: '', phone: '', email: '', address: '' };

type VendorErrors = Partial<Record<'name' | 'name_th' | 'email', string>>;

/** Seed the form from an existing vendor (edit) or blank (create). */
function fromVendor(vendor?: Vendor | null): typeof emptyForm {
    if (!vendor) return emptyForm;
    return {
        name: vendor.name,
        name_th: vendor.name_th ?? '',
        contact: vendor.contact ?? '',
        phone: vendor.phone ?? '',
        email: vendor.email ?? '',
        address: vendor.address ?? '',
    };
}

/** VendorModal — add or edit a vendor (English and Thai names plus contact details); Save shows a spinner, then a tick, then the dialog closes. */
export function VendorModal({ open, vendor, onClose }: { open: boolean; vendor?: Vendor | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { create, update } = useVendorMutations();
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState<VendorErrors>({});
    const [saved, setSaved] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);
    const nameThRef = useRef<HTMLInputElement>(null);
    const emailRef = useRef<HTMLInputElement>(null);
    const closeAfterSave = useCloseAfterSave(open, onClose);
    const saving = create.isPending || update.isPending;

    const initialForm = useMemo(() => fromVendor(vendor), [vendor]);
    const isDirty = !saved && JSON.stringify(form) !== JSON.stringify(initialForm);
    const guardClose = useDiscardGuard(open && isDirty);

    useEffect(() => {
        if (open) {
            setForm(fromVendor(vendor));
            setErrors({});
            setSaved(false);
        }
    }, [open, vendor]);

    const set = (k: keyof typeof emptyForm, v: string) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((e) => ({ ...e, [k]: undefined }));
    };

    // Focus the first field (in form order) that has an error.
    const focusFirstError = (found: VendorErrors) => {
        if (found.name) nameRef.current?.focus();
        else if (found.name_th) nameThRef.current?.focus();
        else if (found.email) emailRef.current?.focus();
    };

    const submit = async () => {
        if (saving || saved) {
            return;
        }
        const missing: VendorErrors = {
            name: form.name.trim() ? undefined : t('set_err_required'),
            name_th: form.name_th.trim() ? undefined : t('set_err_required'),
        };
        if (missing.name || missing.name_th) {
            setErrors(missing);
            focusFirstError(missing);
            return;
        }
        setErrors({});
        if (vendor && isDirty && !(await confirmEdit({ name: localName(vendor, lang) }))) return;
        const payload = {
            name: form.name.trim(),
            name_th: form.name_th.trim(),
            contact: form.contact.trim() || null,
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            address: form.address.trim() || null,
        };
        try {
            if (vendor) {
                await update.mutateAsync({ id: vendor.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setSaved(true);
            closeAfterSave();
        } catch (err) {
            const found: VendorErrors = {
                name: hasFieldError(err, 'name') ? t('md_name_taken') : undefined,
                name_th: hasFieldError(err, 'name_th') ? t('set_err_required') : undefined,
                email: hasFieldError(err, 'email') ? t('md_err_email') : undefined,
            };
            if (found.name || found.name_th || found.email) {
                setErrors(found);
                focusFirstError(found);
            } else {
                useToastStore.getState().push(t('cd_error'), 'error', t('cd_error_title'));
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
                    <DialogTitle>{vendor ? t('md_edit_vendor') : t('md_add_vendor')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('md_modal_desc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_vendor_name_en')} required error={errors.name}>
                            <Input
                                ref={nameRef}
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                autoFocus
                                maxLength={120}
                                onKeyDown={onEnter}
                            />
                        </Field>
                        <Field label={t('md_vendor_name_th')} required error={errors.name_th}>
                            <Input
                                ref={nameThRef}
                                value={form.name_th}
                                onChange={(e) => set('name_th', e.target.value)}
                                maxLength={120}
                                onKeyDown={onEnter}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_contact')}>
                            <Input value={form.contact} onChange={(e) => set('contact', e.target.value)} maxLength={120} onKeyDown={onEnter} />
                        </Field>
                        <Field label={t('md_phone')}>
                            <Input
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                value={form.phone}
                                onChange={(e) => set('phone', e.target.value)}
                                maxLength={50}
                                onKeyDown={onEnter}
                            />
                        </Field>
                    </div>
                    <Field label={t('md_email')} error={errors.email}>
                        <Input
                            ref={emailRef}
                            type="email"
                            spellCheck={false}
                            autoComplete="email"
                            value={form.email}
                            onChange={(e) => set('email', e.target.value)}
                            maxLength={120}
                            onKeyDown={onEnter}
                        />
                    </Field>
                    <Field label={t('md_address')}>
                        <Input value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={255} onKeyDown={onEnter} />
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
