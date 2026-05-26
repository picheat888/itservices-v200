import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SaveButton } from '@/components/shared/save-button';
import { StatusBadge } from '@/components/shared/status-badge';
import { PhotoCropDialog } from '@/components/employees/photo-crop-dialog';
import { useAuth, useUpdateProfile } from '@/hooks/use-auth';
import { useEmployee } from '@/hooks/use-org';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Role } from '@/types';
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

function initials(name: string) {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

// Names are stored as a single space-joined string ("First Last"); the first
// word is the given name and everything after it the surname. This mirrors the
// Add Employee form so editing here stays consistent with how it splits back.
function splitName(full: string | null | undefined): [string, string] {
    const parts = (full ?? '').trim().split(' ');
    return [parts[0] ?? '', parts.slice(1).join(' ')];
}

/** A single read-only label/value row used in the details sections. */
function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
    return (
        <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user } = useAuth();
    const update = useUpdateProfile();
    const inputRef = useRef<HTMLInputElement>(null);

    // Pull the full employee record so the drawer can show every field
    // (department, position, joined date, ...), not just what's on the user.
    const { data: emp } = useEmployee(open ? user?.employee_id ?? null : null);

    const canEdit = !!user && (user.role === 'super' || user.permissions.includes('employees.edit_own'));

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [firstNameTh, setFirstNameTh] = useState('');
    const [lastNameTh, setLastNameTh] = useState('');
    const [phone, setPhone] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    // Prefill from the current user each time the drawer opens.
    useEffect(() => {
        if (open && user) {
            const [fn, ln] = splitName(user.name);
            const [fnTh, lnTh] = splitName(user.name_th);
            setFirstName(fn);
            setLastName(ln);
            setFirstNameTh(fnTh);
            setLastNameTh(lnTh);
            setPhone(user.phone ?? '');
            setPhoto(null);
            setCropSrc(null);
            setError('');
            setSaved(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [open, user]);

    if (!user) return null;
    const role = user.role as Role;

    const displayName = `${firstName} ${lastName}`.trim() || user.name;
    const previewUrl = photo ? URL.createObjectURL(photo) : user.photo_url;
    const department = lang === 'th' ? emp?.department_th ?? emp?.department : emp?.department;
    const loginMethod = emp?.login_method === 'email' ? t('emp_login_email') : t('emp_login_userpass');

    const pickPhoto = (f?: File) => {
        setSaved(false);
        setError('');
        if (!f) return;
        if (!['image/png', 'image/jpeg'].includes(f.type)) {
            setError(t('emp_photo_err_type'));
            return;
        }
        if (f.size > 2 * 1024 * 1024) {
            setError(t('emp_photo_err_size'));
            return;
        }
        if (inputRef.current) inputRef.current.value = '';
        setCropSrc(URL.createObjectURL(f));
    };

    const save = async () => {
        setError('');
        if (!firstName.trim()) {
            setError(t('profile_name_required'));
            return;
        }
        const name = `${firstName} ${lastName}`.trim();
        const nameTh = `${firstNameTh} ${lastNameTh}`.trim();
        const form = new FormData();
        form.append('name', name);
        form.append('name_th', nameTh);
        form.append('phone', phone);
        if (photo) form.append('photo', photo);
        try {
            await update.mutateAsync(form);
            setSaved(true);
            setPhoto(null);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? t('profile_save_failed'));
        }
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[420px] flex-col sm:max-w-[420px]">
                {cropSrc && (
                    <PhotoCropDialog
                        imageSrc={cropSrc}
                        onConfirm={(cropped) => {
                            setPhoto(cropped);
                            URL.revokeObjectURL(cropSrc);
                            setCropSrc(null);
                            setSaved(false);
                        }}
                        onCancel={() => {
                            URL.revokeObjectURL(cropSrc);
                            setCropSrc(null);
                        }}
                    />
                )}
                <SheetHeader>
                    <SheetTitle>{t('profile')}</SheetTitle>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1 pb-4">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Avatar className="h-16 w-16">
                                {previewUrl && <AvatarImage src={previewUrl} alt={user.name} />}
                                <AvatarFallback className="bg-brand/10 text-lg font-semibold text-brand">{initials(displayName)}</AvatarFallback>
                            </Avatar>
                            {canEdit && (
                                <button
                                    onClick={() => inputRef.current?.click()}
                                    title={t('profile_change_photo')}
                                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-brand text-brand-foreground hover:opacity-90"
                                >
                                    <Camera className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-lg font-bold">{displayName}</div>
                            <div className="truncate text-sm text-muted-foreground">{user.group_name ?? t(`role_${role}` as const)}</div>
                            {emp && (
                                <div className="mt-1">
                                    {emp.status === 'resigned' ? (
                                        <StatusBadge tone="red">{t('resigned')}</StatusBadge>
                                    ) : (
                                        <StatusBadge tone="green">{t('active')}</StatusBadge>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Editable fields (gated by employees.edit_own). Split into
                        first/last name to match the Add Employee form. */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>{t('emp_first_name')}</Label>
                                <Input value={firstName} onChange={(e) => { setFirstName(e.target.value); setSaved(false); }} disabled={!canEdit} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('emp_last_name')}</Label>
                                <Input value={lastName} onChange={(e) => { setLastName(e.target.value); setSaved(false); }} disabled={!canEdit} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>{t('emp_first_name_th')}</Label>
                                <Input value={firstNameTh} onChange={(e) => { setFirstNameTh(e.target.value); setSaved(false); }} disabled={!canEdit} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('emp_last_name_th')}</Label>
                                <Input value={lastNameTh} onChange={(e) => { setLastNameTh(e.target.value); setSaved(false); }} disabled={!canEdit} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('emp_phone')}</Label>
                            <Input className="font-mono" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false); }} disabled={!canEdit} />
                        </div>
                        {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
                    </div>

                    {/* Read-only employee details */}
                    <div className="space-y-3 border-t border-border pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('profile_details')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <Row label={t('emp_employee_id')} value={emp?.code} mono />
                            <Row label={t('joined')} value={emp?.joined_at} mono />
                            <Row label={t('position')} value={emp?.position} />
                            <Row label={t('department')} value={department} />
                        </div>
                    </div>

                    {/* Read-only account & access */}
                    <div className="space-y-3 border-t border-border pt-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('profile_account')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <Row label={t('login_email')} value={user.email} mono />
                            <Row label={t('emp_username')} value={user.username} mono />
                            <Row label={t('emp_login_method')} value={emp ? loginMethod : undefined} />
                            <Row label={t('permission_level')} value={user.group_name ?? user.role_label} />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    {canEdit && <SaveButton onClick={save} loading={update.isPending} success={saved} />}
                </div>
            </SheetContent>
        </Sheet>
    );
}
