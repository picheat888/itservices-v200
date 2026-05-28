import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useVendorMutations } from '@/hooks/use-master-data';
import { useT } from '@/lib/i18n';
import type { Vendor } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

/** How long the success checkmark stays visible before the dialog closes. */
const CLOSE_DELAY_MS = 1100;

const emptyForm = { name: '', name_th: '', contact: '', phone: '', email: '', address: '' };

/**
 * VendorModal — dialog for adding or editing a supplier/vendor (both the
 * English and Thai names plus contact details). The Save button shows a spinner
 * while saving and a checkmark on success, then the dialog auto-closes.
 */
export function VendorModal({ open, vendor, onClose }: { open: boolean; vendor?: Vendor | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useVendorMutations();
    const [form, setForm] = useState(emptyForm);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (open) {
            setForm(
                vendor
                    ? {
                          name: vendor.name,
                          name_th: vendor.name_th ?? '',
                          contact: vendor.contact ?? '',
                          phone: vendor.phone ?? '',
                          email: vendor.email ?? '',
                          address: vendor.address ?? '',
                      }
                    : emptyForm,
            );
        }
    }, [open, vendor]);

    const set = (k: keyof typeof emptyForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const submit = async () => {
        if (!form.name.trim() || !form.name_th.trim()) {
            return;
        }
        const payload = {
            name: form.name.trim(),
            name_th: form.name_th.trim() || undefined,
            contact: form.contact.trim() || undefined,
            phone: form.phone.trim() || undefined,
            email: form.email.trim() || undefined,
            address: form.address.trim() || undefined,
        };
        try {
            if (vendor) {
                await update.mutateAsync({ id: vendor.id, ...payload });
            } else {
                await create.mutateAsync(payload);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Something went wrong.' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{vendor ? t('md_edit_vendor') : t('md_add_vendor')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_vendor_name_en')} required>
                            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder={t('md_vendor_name_en')} />
                        </Field>
                        <Field label={t('md_vendor_name_th')} required>
                            <Input value={form.name_th} onChange={(e) => set('name_th', e.target.value)} placeholder={t('md_vendor_name_th')} />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('md_contact')}>
                            <Input value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder={t('md_contact')} />
                        </Field>
                        <Field label={t('md_phone')}>
                            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder={t('md_phone')} />
                        </Field>
                    </div>
                    <Field label={t('md_email')}>
                        <Input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" placeholder={t('md_email')} />
                    </Field>
                    <Field label={t('md_address')}>
                        <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder={t('md_address')} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} onClick={submit} disabled={!form.name.trim() || !form.name_th.trim()} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
