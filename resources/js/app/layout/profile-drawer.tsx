import { useT } from '@/lang';
import { useAuth, useUpdateProfile } from '@/modules/auth';
import { PhotoCropDialog, useEmployee } from '@/modules/employee';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useUiStore } from '@/stores/ui';
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user, can } = useAuth();
    const update = useUpdateProfile();
    const inputRef = useRef<HTMLInputElement>(null);

    // Pull the full employee record so the drawer can show every field
    // (department, position, joined date, ...), not just what's on the user.
    const { data: emp } = useEmployee(open ? (user?.employee_id ?? null) : null);

    const canEdit = can('employees.edit_own');

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
            // Prefer the linked employee's split fields; fall back to splitting
            // the composed name for accounts without an employee record.
            const [fn, ln] = splitName(user.name);
            const [fnTh, lnTh] = splitName(user.name_th);
            setFirstName(user.first_name ?? fn);
            setLastName(user.last_name ?? ln);
            setFirstNameTh(user.first_name_th ?? fnTh);
            setLastNameTh(user.last_name_th ?? lnTh);
            setPhone(user.phone ?? '');
            setPhoto(null);
            setCropSrc(null);
            setError('');
            setSaved(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [open, user]);

    if (!user) return null;

    const displayName = `${firstName} ${lastName}`.trim() || user.name;
    const previewUrl = photo ? URL.createObjectURL(photo) : user.photo_url;
    const department = lang === 'th' ? (emp?.department_th ?? emp?.department) : emp?.department;

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
        if (!firstName.trim() || !lastName.trim()) {
            setError(t('profile_name_required'));
            return;
        }
        const form = new FormData();
        form.append('first_name', firstName.trim());
        form.append('last_name', lastName.trim());
        form.append('first_name_th', firstNameTh.trim());
        form.append('last_name_th', lastNameTh.trim());
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
                            <UserAvatar name={displayName} photoUrl={previewUrl} className="h-16 w-16" textClassName="text-lg" />
                            {canEdit && (
                                <button
                                    onClick={() => inputRef.current?.click()}
                                    title={t('profile_change_photo')}
                                    className="border-background bg-brand text-brand-foreground absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 hover:opacity-90"
                                >
                                    <Camera className="h-3.5 w-3.5" />
                                </button>
                            )}
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/png,image/jpeg"
                                className="hidden"
                                onChange={(e) => pickPhoto(e.target.files?.[0])}
                            />
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-lg font-bold">{displayName}</div>
                            <div className="text-muted-foreground truncate text-sm">{user.group_name ?? user.role_label}</div>
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
                                <Input
                                    value={firstName}
                                    onChange={(e) => {
                                        setFirstName(e.target.value);
                                        setSaved(false);
                                    }}
                                    disabled={!canEdit}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('emp_last_name')}</Label>
                                <Input
                                    value={lastName}
                                    onChange={(e) => {
                                        setLastName(e.target.value);
                                        setSaved(false);
                                    }}
                                    disabled={!canEdit}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>{t('emp_first_name_th')}</Label>
                                <Input
                                    value={firstNameTh}
                                    onChange={(e) => {
                                        setFirstNameTh(e.target.value);
                                        setSaved(false);
                                    }}
                                    disabled={!canEdit}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('emp_last_name_th')}</Label>
                                <Input
                                    value={lastNameTh}
                                    onChange={(e) => {
                                        setLastNameTh(e.target.value);
                                        setSaved(false);
                                    }}
                                    disabled={!canEdit}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('emp_phone')}</Label>
                            <Input
                                className="font-mono"
                                value={phone}
                                onChange={(e) => {
                                    setPhone(e.target.value);
                                    setSaved(false);
                                }}
                                disabled={!canEdit}
                            />
                        </div>
                        {error && <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">{error}</div>}
                    </div>

                    {/* Read-only employee details */}
                    <div className="border-border space-y-3 border-t pt-4">
                        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('profile_details')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <Row label={t('emp_employee_id')} value={emp?.code} mono />
                            <Row label={t('joined')} value={emp?.joined_at} mono />
                            <Row label={t('position')} value={emp?.position} />
                            <Row label={t('department')} value={department} />
                        </div>
                    </div>

                    {/* Read-only account & access */}
                    <div className="border-border space-y-3 border-t pt-4">
                        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{t('profile_account')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <Row label={t('login_email')} value={user.email} mono />
                            <Row label={t('emp_username')} value={user.username} mono />
                            <Row label={t('permission_level')} value={user.group_name ?? user.role_label} />
                        </div>
                    </div>
                </div>

                <div className="border-border flex items-center justify-end gap-3 border-t pt-4">
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    {canEdit && <SaveButton onClick={save} loading={update.isPending} success={saved} />}
                </div>
            </SheetContent>
        </Sheet>
    );
}
