import { translate, useT } from '@/lang';
import { ColorSwatchPicker, DEFAULT_SWATCHES } from '@/shared/components/color-swatch-picker';
import { Field } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RoleRow } from '../api/permissionApi';
import { useRoleMutations } from '../hooks/use-permissions';

const DEFAULT_COLOR = DEFAULT_SWATCHES[0].hex;

export function RoleModal({ open, onClose, role }: { open: boolean; onClose: () => void; role: RoleRow | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { create, update } = useRoleMutations();
    const [name, setName] = useState('');
    const [color, setColor] = useState(DEFAULT_COLOR);
    // Brief "Saved" success state shown on the save button before the modal closes.
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (open) {
            setName(role?.label ?? '');
            setColor(role?.color ?? DEFAULT_COLOR);
            setSaved(false);
        }
    }, [open, role]);

    const isDirty = name !== (role?.label ?? '') || color.toLowerCase() !== (role?.color ?? DEFAULT_COLOR).toLowerCase();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    // Set before the first await, so a second click in the same frame is ignored
    const submitting = useRef(false);
    const submit = async () => {
        if (submitting.current || saved || !name.trim()) return;
        submitting.current = true;
        try {
            if (role) {
                if (isDirty && !(await confirmEdit({ name: role.label }))) return;
                await update.mutateAsync({ key: role.value, name, color });
            } else {
                await create.mutateAsync({ name, color });
            }
            setSaved(true);
            setTimeout(onClose, 900);
        } catch {
            useToastStore.getState().push(t('cd_error'), 'error');
        } finally {
            submitting.current = false;
        }
    };

    const saving = create.isPending || update.isPending;

    /** Save button label that swaps to a spinner then a green check while saving. */
    const saveButtonLabel = () => {
        if (saved) {
            return (
                <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    {translate(lang, 'perm_ui_saved')}
                </span>
            );
        }
        if (saving) {
            return (
                <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {translate(lang, 'perm_ui_saving')}
                </span>
            );
        }
        return t('save');
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{role ? t('perm_change_props') : t('perm_new_role')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('perm_role_name')}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('perm_role_name_ph')} />
                    </Field>
                    <ColorSwatchPicker label={t('perm_role_color')} showLabel value={color} onChange={setColor} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving || saved}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!name.trim() || (role !== null && !isDirty) || saving || saved}>
                        {saveButtonLabel()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
