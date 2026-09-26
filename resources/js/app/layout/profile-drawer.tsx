import { useT } from '@/lang';
import { useMyAccess } from '@/modules/access';
import { useMyAssets } from '@/modules/asset';
import { useAuth, useUpdateProfile } from '@/modules/auth';
import { PhotoCropDialog, useEmployee } from '@/modules/employee';
import { useTickets } from '@/modules/ticket';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { formatDateTime } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import type { EmployeeAccessRow } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useUiStore } from '@/stores/ui';
import { AtSign, Box, Briefcase, Building2, Camera, Hash, IdCard, KeyRound, Phone, Shield, Ticket, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// Names are stored as a single space-joined string ("First Last"); the first
// word is the given name and everything after it the surname. This mirrors the
// Add Employee form so editing here stays consistent with how it splits back.
function splitName(full: string | null | undefined): [string, string] {
    const parts = (full ?? '').trim().split(' ');
    return [parts[0] ?? '', parts.slice(1).join(' ')];
}

/** One fact in the left rail: an icon, what it is, and what it says. */
function RailFact({ icon: Icon, label, value, mono }: { icon: typeof Hash; label: string; value?: string | null; mono?: boolean }) {
    return (
        <div className="flex items-start gap-2.5">
            <span className="bg-muted text-muted-foreground mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[11px]">{label}</div>
                <div className={cn('truncate text-sm', mono && 'font-mono text-[13px]')}>{value || '—'}</div>
            </div>
        </div>
    );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{title}</div>
            {children}
        </div>
    );
}

/** A chip of identity under the name — the same shape the employee drawer uses. */
function IdChip({ icon: Icon, children }: { icon: typeof Hash; children: React.ReactNode }) {
    return (
        <span className="border-border bg-card text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium">
            <Icon className="text-muted-foreground h-3.5 w-3.5" />
            {children}
        </span>
    );
}

/**
 * One line in a holdings tab.
 *
 * The tabs summarise rather than duplicate: the pages behind them can accept a handover, request
 * a return, open a case. Rebuilding those actions in a drawer would be two places to fix every
 * time one of them changes, so each tab shows what you hold and sends you to the page that acts.
 */
function ItemRow({ icon: Icon, title, sub, right }: { icon: typeof Hash; title: string; sub?: string | null; right?: React.ReactNode }) {
    return (
        <div className="border-border/60 flex items-center gap-3 border-b py-2.5 last:border-0">
            <span className="bg-muted text-muted-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md">
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{title}</div>
                {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
            </div>
            {right}
        </div>
    );
}

function EmptyTab({ text }: { text: string }) {
    return <div className="text-muted-foreground py-12 text-center text-sm">{text}</div>;
}

type TabId = 'profile' | 'assets' | 'tickets' | 'access';

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const setPasswordDialog = useUiStore((s) => s.setPasswordDialog);
    const { user, can } = useAuth();
    const update = useUpdateProfile();
    const inputRef = useRef<HTMLInputElement>(null);

    // Pull the full employee record so the drawer can show every field
    // (department, position, joined date, ...), not just what's on the user.
    const { data: emp } = useEmployee(open ? (user?.employee_id ?? null) : null);

    const canEdit = can('employees.edit_own');
    // Each tab answers to the permission its own page answers to, so the drawer never offers a
    // view of something the reader would be refused on the page it links to.
    const seesAssets = can('assets.my');
    const seesAccess = can('access.my');
    const seesTickets = can('tickets.my');

    const { data: myAssets = [], isLoading: assetsLoading } = useMyAssets(open && seesAssets);
    const { data: myAccess, isLoading: accessLoading } = useMyAccess(open && seesAccess);
    const { data: myTickets, isLoading: ticketsLoading } = useTickets({ page: 1, per_page: 8, requested: true }, open && seesTickets);

    const [tab, setTab] = useState<TabId>('profile');
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
            setTab('profile');
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [open, user]);

    if (!user) return null;

    // Built from the edit state, not from the user, so the header tracks what is being
    // typed. In Thai the Thai pair wins when it has been filled in; an account with no
    // Thai name keeps showing the English one rather than going blank.
    const nameEn = `${firstName} ${lastName}`.trim() || user.name;
    const nameTh = `${firstNameTh} ${lastNameTh}`.trim();
    const displayName = lang === 'th' ? nameTh || nameEn : nameEn;
    const previewUrl = photo ? URL.createObjectURL(photo) : user.photo_url;
    const department = lang === 'th' ? (emp?.department_th ?? emp?.department) : emp?.department;

    const accessRow = (prefix: string) => (r: EmployeeAccessRow) => ({
        key: `${prefix}-${r.id}`,
        name: r.resource_name ?? r.resource_code ?? '—',
        sub: r.access_level ?? r.resource_detail,
    });
    const accessRows = [
        ...(myAccess?.software ?? []).map(accessRow('sw')),
        ...(myAccess?.file_shares ?? []).map(accessRow('fs')),
        ...(myAccess?.email_groups ?? []).map(accessRow('eg')),
        ...(myAccess?.social ?? []).map(accessRow('so')),
    ];
    const ticketRows = myTickets?.data ?? [];

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

    const tabs: { id: TabId; label: string; icon: typeof Hash; count?: number; show: boolean }[] = [
        { id: 'profile', label: t('profile_tab_details'), icon: UserRound, show: true },
        { id: 'assets', label: t('profile_tab_assets'), icon: Box, count: assetsLoading ? undefined : myAssets.length, show: seesAssets },
        {
            id: 'tickets',
            label: t('profile_tab_tickets'),
            icon: Ticket,
            count: ticketsLoading ? undefined : myTickets?.meta?.total,
            show: seesTickets,
        },
        { id: 'access', label: t('profile_tab_access'), icon: Shield, count: accessLoading ? undefined : accessRows.length, show: seesAccess },
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="flex h-[88vh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{t('profile')}</DialogTitle>
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

                {/* ── COVER ── who you are, before anything you can change about it. The old drawer
                     opened straight into input boxes and pushed the identity to the bottom. */}
                <div
                    className="border-border flex shrink-0 items-center gap-5 border-b px-7 pt-6 pb-5"
                    style={{ background: 'radial-gradient(120% 160% at 0% 0%, var(--accent) 0%, var(--card) 60%)' }}
                >
                    <div className="relative shrink-0">
                        <UserAvatar
                            name={nameEn}
                            photoUrl={previewUrl}
                            className="ring-card h-[72px] w-[72px] shadow-md ring-2"
                            textClassName="text-2xl"
                        />
                        {canEdit && (
                            <button
                                onClick={() => inputRef.current?.click()}
                                title={t('profile_change_photo')}
                                className="border-card bg-brand text-brand-foreground absolute -right-1 -bottom-1 flex h-7 w-7 items-center justify-center rounded-full border-2 hover:opacity-90"
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

                    <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                            <h2 className="truncate text-xl leading-tight font-extrabold tracking-tight">{displayName}</h2>
                            {emp?.status === 'resigned' ? (
                                <StatusBadge tone="red">{t('resigned')}</StatusBadge>
                            ) : (
                                emp && <StatusBadge tone="green">{t('active')}</StatusBadge>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {emp?.code && <IdChip icon={Hash}>{emp.code}</IdChip>}
                            {emp?.position && <IdChip icon={Briefcase}>{emp.position}</IdChip>}
                            {department && <IdChip icon={Building2}>{department}</IdChip>}
                            <IdChip icon={Shield}>{user.group_name ?? user.role_label}</IdChip>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-0 flex-1">
                    {/* ── RAIL ── the facts nobody edits here, out of the form's way. */}
                    <aside className="border-border flex w-[300px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-5">
                        <RailSection title={t('profile_contact')}>
                            <RailFact icon={AtSign} label={t('login_email')} value={user.email} mono />
                            <RailFact icon={Phone} label={t('emp_phone')} value={phone} mono />
                        </RailSection>
                        <RailSection title={t('profile_account')}>
                            <RailFact icon={KeyRound} label={t('emp_username')} value={user.username} mono />
                            <RailFact icon={Shield} label={t('permission_level')} value={user.group_name ?? user.role_label} />
                        </RailSection>
                        <RailSection title={t('profile_details')}>
                            <RailFact icon={IdCard} label={t('emp_employee_id')} value={emp?.code} mono />
                            <RailFact icon={Briefcase} label={t('position')} value={emp?.position} />
                            <RailFact icon={Building2} label={t('department')} value={department} />
                            <RailFact icon={Hash} label={t('joined')} value={emp?.joined_at} mono />
                        </RailSection>
                    </aside>

                    <section className="flex min-w-0 flex-1 flex-col">
                        <div className="border-border flex shrink-0 gap-1 border-b px-5 pt-3">
                            {tabs
                                .filter((tb) => tb.show)
                                .map((tb) => (
                                    <button
                                        key={tb.id}
                                        type="button"
                                        onClick={() => setTab(tb.id)}
                                        className={cn(
                                            'relative inline-flex items-center gap-1.5 rounded-t-lg px-3 pt-2 pb-3 text-[12.5px] font-semibold transition-colors',
                                            tab === tb.id ? 'text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                                        )}
                                    >
                                        <tb.icon className="h-[15px] w-[15px]" />
                                        {tb.label}
                                        {tb.count != null && tb.count > 0 && (
                                            <span className="bg-muted text-muted-foreground inline-grid h-[17px] min-w-[17px] place-items-center rounded-full px-1.5 font-mono text-[10.5px] font-bold">
                                                {tb.count}
                                            </span>
                                        )}
                                        {tab === tb.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-[2.5px] rounded" />}
                                    </button>
                                ))}
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-5">
                            {tab === 'profile' && (
                                <div className="max-w-xl space-y-4">
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
                            )}

                            {tab === 'assets' &&
                                (assetsLoading ? (
                                    <EmptyTab text="…" />
                                ) : myAssets.length === 0 ? (
                                    <EmptyTab text={t('profile_no_assets')} />
                                ) : (
                                    <>
                                        {myAssets.map((a) => (
                                            <ItemRow
                                                key={a.id}
                                                icon={Box}
                                                title={a.model ?? a.asset_code}
                                                sub={a.serial ?? a.asset_code}
                                                right={<span className="text-muted-foreground shrink-0 font-mono text-xs">{a.asset_code}</span>}
                                            />
                                        ))}
                                        <Link
                                            to="/my-assets-access"
                                            onClick={onClose}
                                            className="text-brand mt-4 inline-block text-sm font-medium hover:underline"
                                        >
                                            {t('profile_see_all')}
                                        </Link>
                                    </>
                                ))}

                            {tab === 'tickets' &&
                                (ticketsLoading ? (
                                    <EmptyTab text="…" />
                                ) : ticketRows.length === 0 ? (
                                    <EmptyTab text={t('profile_no_tickets')} />
                                ) : (
                                    <>
                                        {ticketRows.map((tk) => (
                                            <ItemRow
                                                key={tk.id}
                                                icon={Ticket}
                                                title={tk.subject}
                                                sub={tk.ticket_no}
                                                right={
                                                    <span className="text-muted-foreground shrink-0 text-xs">
                                                        {formatDateTime(tk.created_at, false)}
                                                    </span>
                                                }
                                            />
                                        ))}
                                        <Link
                                            to="/tickets?tab=my"
                                            onClick={onClose}
                                            className="text-brand mt-4 inline-block text-sm font-medium hover:underline"
                                        >
                                            {t('profile_see_all')}
                                        </Link>
                                    </>
                                ))}

                            {tab === 'access' &&
                                (accessLoading ? (
                                    <EmptyTab text="…" />
                                ) : accessRows.length === 0 ? (
                                    <EmptyTab text={t('profile_no_access')} />
                                ) : (
                                    <>
                                        {accessRows.map((r) => (
                                            <ItemRow key={r.key} icon={Shield} title={r.name} sub={r.sub} />
                                        ))}
                                        <Link
                                            to="/my-assets-access"
                                            onClick={onClose}
                                            className="text-brand mt-4 inline-block text-sm font-medium hover:underline"
                                        >
                                            {t('profile_see_all')}
                                        </Link>
                                    </>
                                ))}
                        </div>
                    </section>
                </div>

                {/* Save belongs to the profile tab; the others are read-only, so the footer says
                    so rather than offering a button that would save a form nobody is looking at. */}
                <div className="border-border flex shrink-0 items-center justify-end gap-3 border-t px-7 py-4">
                    {/* The only way in the app to change a password on purpose. Without it the
                        expiry warning has nothing to send the reader to, and a password could
                        only ever be changed by being locked out first. Left of Close because it
                        is an action on the account, not a way out of the drawer. */}
                    <Button
                        variant="outline"
                        className="mr-auto"
                        onClick={() => {
                            onClose();
                            setPasswordDialog(true);
                        }}
                    >
                        <KeyRound className="h-4 w-4" />
                        {t('pwd_change_title')}
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {canEdit && tab === 'profile' && <SaveButton onClick={save} loading={update.isPending} success={saved} />}
                </div>
            </DialogContent>
        </Dialog>
    );
}
