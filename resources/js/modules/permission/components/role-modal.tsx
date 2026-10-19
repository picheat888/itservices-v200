import { useT } from '@/lang';
import { ColorSwatchPicker, DEFAULT_SWATCHES } from '@/shared/components/color-swatch-picker';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Copy, Shield } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { RoleRow } from '../api/permissionApi';
import { useRoleMutations } from '../hooks/use-permissions';
import { permissionRefusalText, refusalCode } from '../lib/refusal';

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
    const formError = useFormError();

    useEffect(() => {
        if (open) {
            setName(initialName);
            setColor(initialColor);
            setSaved(false);
            formError.clear();
        }
    }, [open, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    const isDirty = name !== initialName || color.toLowerCase() !== initialColor.toLowerCase();
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    // Set before the first await, so a second click in the same frame is ignored
    const submitting = useRef(false);
    const submit = async () => {
        if (submitting.current || saved || !name.trim()) return;
        submitting.current = true;
        formError.clear();
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
            const ceiling = source && refusalCode(error) === 'grant_ceiling';
            const text = ceiling ? t('perm_duplicate_ceiling').replace('{name}', source.label) : permissionRefusalText(error, t);
            formError.show(text);
        } finally {
            submitting.current = false;
        }
    };

    const saving = create.isPending || update.isPending || duplicate.isPending;

    // The header keeps the role being changed or copied while the dialog closes
    const [shownMode, setShownMode] = useState(mode);
    useEffect(() => {
        if (open) setShownMode(mode);
    }, [open, mode]);
    const viewMode = open ? mode : shownMode;
    const viewRole = viewMode.kind === 'edit' ? viewMode.role : null;
    const viewSource = viewMode.kind === 'duplicate' ? viewMode.source : null;
    const title = viewSource ? t('perm_duplicate_title') : viewRole ? t('perm_change_props') : t('perm_new_role');
    const copiedFrom = viewSource ? t('perm_duplicate_from').replace('{name}', viewSource.label) : undefined;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Shield}
                    eyebrow={t('permissions')}
                    title={title}
                    code={viewRole?.label}
                    subtitle={copiedFrom ? <span className="text-muted-foreground text-sm">{copiedFrom}</span> : undefined}
                    srDescription={copiedFrom}
                />
                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    <Field label={t('perm_role_name')}>
                        <Input
                            name="role-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            autoComplete="off"
                            placeholder={t('perm_role_name_ph')}
                        />
                    </Field>
                    <ColorSwatchPicker label={t('perm_role_color')} showLabel value={color} onChange={setColor} />
                    {source && (
                        <p className="text-muted-foreground border-border mt-4 border-t pt-3 text-[13px] whitespace-pre-line">
                            {t('perm_duplicate_note')
                                .replace('{n}', fmtN(mode.kind === 'duplicate' ? mode.savedCount : 0))
                                .replace('{name}', source.label)}
                        </p>
                    )}
                </DialogBody>
                <DialogFooterBar>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving || saved}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={saving} success={saved} disabled={!name.trim() || (role !== null && !isDirty) || saved}>
                        {source ? (
                            <>
                                <Copy className="h-4 w-4" />
                                {t('perm_duplicate')}
                            </>
                        ) : (
                            t('save')
                        )}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
