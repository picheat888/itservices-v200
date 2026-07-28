import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoleRow } from '../api/permissionApi';
import { useRoleMutations } from '../hooks/use-permissions';

const COLORS = ['#2563eb', '#0284c7', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0f172a'];

export function RoleModal({ open, onClose, role }: { open: boolean; onClose: () => void; role: RoleRow | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const confirm = useConfirm();
    const { create, update } = useRoleMutations();
    const [name, setName] = useState('');
    const [color, setColor] = useState(COLORS[0]);
    // Brief "Saved" success state shown on the save button before the modal closes.
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (open) {
            setName(role?.label ?? '');
            setColor(role?.color ?? COLORS[0]);
            setSaved(false);
        }
    }, [open, role]);

    const submit = async () => {
        if (!name.trim()) return;

        if (role) {
            // Capture values before closing to avoid a Radix focus-trap conflict
            const capturedName = name;
            const capturedColor = color;

            onClose();

            await confirm({
                variant: 'edit',
                title: t('perm_change_props'),
                entity: { name: capturedName },
                action: () => update.mutateAsync({ key: role.value, name: capturedName, color: capturedColor }),
            });
        } else {
            await create.mutateAsync({ name, color });
            setSaved(true);
            // Let the green check land for a moment before the dialog closes.
            setTimeout(onClose, 900);
        }
    };

    const saving = create.isPending || update.isPending;

    /** Save button label that swaps to a spinner then a green check while saving. */
    const saveButtonLabel = () => {
        if (saved) {
            return (
                <span className="flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    {lang === 'th' ? 'บันทึกแล้ว' : 'Saved'}
                </span>
            );
        }
        if (saving) {
            return (
                <span className="flex items-center gap-1.5">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {lang === 'th' ? 'กำลังบันทึก…' : 'Saving…'}
                </span>
            );
        }
        return t('save');
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{role ? t('perm_change_props') : t('perm_new_role')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <Field label={t('perm_role_name')}>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Auditor" />
                    </Field>
                    <div>
                        <div className="mb-2 text-sm font-medium">{t('perm_role_color')}</div>
                        <div className="flex gap-2">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'ring-offset-background h-8 w-8 rounded-full ring-2 ring-offset-2 transition-all',
                                        color.toLowerCase() === c.toLowerCase() ? 'ring-foreground' : 'ring-transparent',
                                    )}
                                    style={{ background: c }}
                                    aria-label={c}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving || saved}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!name.trim() || saving || saved}>
                        {saveButtonLabel()}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
