import { translate, useT } from '@/lang';
import { ColorSwatchPicker, DEFAULT_SWATCHES } from '@/shared/components/color-swatch-picker';
import { Field } from '@/shared/components/field';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RoleRow } from '../api/permissionApi';
import { useRoleMutations } from '../hooks/use-permissions';
import { permissionRefusalText } from '../lib/refusal';

const DEFAULT_COLOR = DEFAULT_SWATCHES[0].hex;

/** The dialog's job: a new role, an edit of `role`, or a copy of `source` with its saved permissions. */
export type RoleModalMode = { kind: 'create' } | { kind: 'edit'; role: RoleRow } | { kind: 'duplicate'; source: RoleRow; savedCount: number };

export function RoleModal({
    open,
    onClose,
    mode,
    onDuplicated,
}: {
    open: boolean;
    onClose: () => void;
    mode: RoleModalMode;
    onDuplicated: (key: string) => void;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const confirmEdit = useConfirmEdit();
    const { create, update, duplicate } = useRoleMutations();
    const role = mode.kind === 'edit' ? mode.role : null;
    const source = mode.kind === 'duplicate' ? mode.source : null;
    const initialName = role?.label ?? (source ? t('perm_duplicate_name').replace('{name}', source.label) : '');
    const initialColor = (role ?? source)?.color ?? DEFAULT_COLOR;
    const [name, setName] = useState('');
    const [color, setColor] = useState(DEFAULT_COLOR);
    // Brief "Saved" success state shown on the save button before the modal closes.
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initialName);
            setColor(initialColor);
            setSaved(false);
        }
    }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    const isDirty = name !== initialName || color.toLowerCase() !== initialColor.toLowerCase();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    // Set before the first await, so a second click in the same frame is ignored
    const submitting = useRef(false);
    const submit = async () => {
        if (submitting.current || saved || !name.trim()) return;
        submitting.current = true;
        try {
            let createdKey: string | null = null;
            if (role) {
                if (isDirty && !(await confirmEdit({ name: role.label }))) return;
                await update.mutateAsync({ key: role.value, name, color });
            } else if (source) {
                createdKey = (await duplicate.mutateAsync({ key: source.value, name, color })).key;
            } else {
                await create.mutateAsync({ name, color });
            }
            setSaved(true);
            setTimeout(() => {
                onClose();
                if (createdKey) onDuplicated(createdKey);
            }, 900);
        } catch (error) {
            useToastStore.getState().push(permissionRefusalText(error, t), 'error');
        } finally {
            submitting.current = false;
        }
    };

    const saving = create.isPending || update.isPending || duplicate.isPending;

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
        if (source) {
            return (
                <span className="flex items-center gap-1.5">
                    <Copy className="h-4 w-4" />
                    {t('perm_duplicate')}
                </span>
            );
        }
        return t('save');
    };

    const title = source ? t('perm_duplicate_title') : role ? t('perm_change_props') : t('perm_new_role');

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {source && <DialogDescription>{t('perm_duplicate_from').replace('{name}', source.label)}</DialogDescription>}
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('perm_role_name')}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={t('perm_role_name_ph')} />
                    </Field>
                    <ColorSwatchPicker label={t('perm_role_color')} showLabel value={color} onChange={setColor} />
                    {source && (
                        <p className="text-muted-foreground border-border border-t pt-3 text-[13px] text-pretty">
                            {t('perm_duplicate_note')
                                .replace('{n}', fmtN(mode.kind === 'duplicate' ? mode.savedCount : 0))
                                .replace('{name}', source.label)}
                        </p>
                    )}
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
