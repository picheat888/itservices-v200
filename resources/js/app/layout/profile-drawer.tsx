import { useT } from '@/lang';
import { useMyAccess } from '@/modules/access';
import { useMyAssets } from '@/modules/asset';
import { useAuth, useUpdateProfile } from '@/modules/auth';
import { PhotoCropDialog, useEmployee } from '@/modules/employee';
import { useTickets } from '@/modules/ticket';
import { dialogTabId, DialogTabs, type DialogTab } from '@/shared/components/dialog-tabs';
import { EmptyPane } from '@/shared/components/empty-pane';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { EmployeeAccessRow, User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { AtSign, Box, Briefcase, Building2, Camera, Hash, IdCard, KeyRound, Phone, Shield, Ticket, UserRound } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// Names are stored as one space-joined string: the first word is the given name, the rest the surname
function splitName(full: string | null | undefined): [string, string] {
    const parts = (full ?? '').trim().split(' ');
    return [parts[0] ?? '', parts.slice(1).join(' ')];
}

/** The editable fields as the form is seeded from the user — also the baseline for unsaved changes. */
function profileFields(user: User) {
    // Prefer the linked employee's split fields; fall back to splitting the composed name.
    const [fn, ln] = splitName(user.name);
    const [fnTh, lnTh] = splitName(user.name_th);
    return {
        firstName: user.first_name ?? fn,
        lastName: user.last_name ?? ln,
        firstNameTh: user.first_name_th ?? fnTh,
        lastNameTh: user.last_name_th ?? lnTh,
        phone: user.phone ?? '',
    };
}

type FormKey = keyof ReturnType<typeof profileFields>;

/** API field name → form field, for showing a server error under its field. */
const SERVER_FIELDS: Record<string, FormKey> = {
    first_name: 'firstName',
    last_name: 'lastName',
    first_name_th: 'firstNameTh',
    last_name_th: 'lastNameTh',
    phone: 'phone',
};

// Same rail heading as the employee viewer
const RAIL_HEADING = 'text-muted-foreground border-border border-b pb-1.5 text-xs font-bold';

/** One fact in the left rail: an icon, what it is, and what it says. */
function RailFact({ icon: Icon, label, value, mono }: { icon: typeof Hash; label: string; value?: string | null; mono?: boolean }) {
    return (
        <div className="flex items-start gap-2.5">
            <span className="bg-muted text-muted-foreground mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md">
                <Icon className="h-3.5 w-3.5" aria-hidden />
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
        <section className="flex flex-col gap-3">
            <div className={RAIL_HEADING}>{title}</div>
            {children}
        </section>
    );
}

/** A chip of identity under the name — the same shape the employee drawer uses. */
function IdChip({ icon: Icon, children }: { icon: typeof Hash; children: React.ReactNode }) {
    return (
        <span className="border-border bg-card text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium">
            <Icon className="text-muted-foreground h-3.5 w-3.5" aria-hidden />
            {children}
        </span>
    );
}

/** One line in a holdings tab; the page behind "see all" is where things get done. */
function ItemRow({ icon: Icon, title, sub, right }: { icon: typeof Hash; title: string; sub?: string | null; right?: React.ReactNode }) {
    return (
        <div className="border-border/60 flex items-center gap-3 border-b py-2.5 last:border-0">
            <span className="bg-muted text-muted-foreground grid h-8 w-8 shrink-0 place-items-center rounded-md">
                <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{title}</div>
                {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
            </div>
            {right}
        </div>
    );
}

/** Placeholder rows while a holdings tab loads, shaped like ItemRow. */
function LoadingRows() {
    return (
        <div aria-hidden>
            {[0, 1, 2].map((i) => (
                <div key={i} className="border-border/60 flex items-center gap-3 border-b py-2.5 last:border-0">
                    <span className="bg-muted h-8 w-8 shrink-0 animate-pulse rounded-md" />
                    <div className="flex-1 space-y-1.5">
                        <div className="bg-muted h-3.5 w-1/2 animate-pulse rounded" />
                        <div className="bg-muted h-3 w-1/3 animate-pulse rounded" />
                    </div>
                </div>
            ))}
        </div>
    );
}

type TabId = 'profile' | 'assets' | 'tickets' | 'access';

export function ProfileDrawer({ open, onClose, onChangePassword }: { open: boolean; onClose: () => void; onChangePassword: () => void }) {
    const fmt = useDateFormat();
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { user, can } = useAuth();
    const update = useUpdateProfile();
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const panelId = useId();

    // The full employee record: department, position, joined date…
    const { data: emp } = useEmployee(open ? (user?.employee_id ?? null) : null);

    const canEdit = can('employees.edit_own');
    // Each tab answers to its own page's permission, so the drawer never shows what that page would refuse
    const seesAssets = can('assets.my');
    const seesAccess = can('access.my');
    const seesTickets = can('tickets.my');

    const { data: myAssets = [], isLoading: assetsLoading } = useMyAssets(open && seesAssets);
    const { data: myAccess, isLoading: accessLoading } = useMyAccess(open && seesAccess);
    const { data: myTickets, isLoading: ticketsLoading } = useTickets({ page: 1, per_page: 8, requested: true }, open && seesTickets);

    const [tab, setTab] = useState<TabId>('profile');
    const [fields, setFields] = useState<Record<FormKey, string>>({ firstName: '', lastName: '', firstNameTh: '', lastNameTh: '', phone: '' });
    const [errors, setErrors] = useState<Partial<Record<FormKey, string>>>({});
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);
    const [saved, setSaved] = useState(false);

    // Seeded once per opening, so a refreshed user (e.g. after Change password) never wipes unsaved edits
    const seeded = useRef(false);
    useEffect(() => {
        if (!open) {
            seeded.current = false;
            return;
        }
        if (!user || seeded.current) return;
        seeded.current = true;
        setFields(profileFields(user));
        setErrors({});
        setPhoto(null);
        setCropSrc(null);
        setFormError('');
        setSaved(false);
        setTab('profile');
        if (inputRef.current) inputRef.current.value = '';
    }, [open, user]);

    // One object URL per picked photo, released when it changes
    const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
    useEffect(() => () => (photoUrl ? URL.revokeObjectURL(photoUrl) : undefined), [photoUrl]);

    const isDirty = !!user && (JSON.stringify(fields) !== JSON.stringify(profileFields(user)) || photo !== null);
    const hasUnsaved = open && isDirty && !saved;
    const guardClose = useDiscardGuard(hasUnsaved);
    // A "see all" link waits for the discard answer; the new page drops ?dialog= and so closes the drawer.
    const leaveTo = (to: string) => (e: React.MouseEvent) => {
        if (!hasUnsaved) return;
        e.preventDefault();
        guardClose(() => navigate(to));
    };

    if (!user) return null;

    const { firstName, lastName, firstNameTh, lastNameTh, phone } = fields;
    // The header tracks what is being typed; in Thai the Thai pair wins once it is filled in
    const nameEn = `${firstName} ${lastName}`.trim() || user.name;
    const nameTh = `${firstNameTh} ${lastNameTh}`.trim();
    const displayName = lang === 'th' ? nameTh || nameEn : nameEn;
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

    const showFormError = (message: string) => {
        setFormError(message);
        setFormErrorCount((n) => n + 1);
    };

    const edit = (key: FormKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFields((f) => ({ ...f, [key]: value }));
        setErrors((er) => (key in er ? { ...er, [key]: undefined } : er));
        setSaved(false);
    };

    const pickPhoto = (f?: File) => {
        setSaved(false);
        setFormError('');
        if (!f) return;
        if (!['image/png', 'image/jpeg'].includes(f.type)) {
            showFormError(t('emp_photo_err_type'));
            return;
        }
        if (f.size > 2 * 1024 * 1024) {
            showFormError(t('emp_photo_err_size'));
            return;
        }
        if (inputRef.current) inputRef.current.value = '';
        setCropSrc(URL.createObjectURL(f));
    };

    const save = async () => {
        setFormError('');
        const found: Partial<Record<FormKey, string>> = {};
        if (!firstName.trim()) found.firstName = t('profile_name_required');
        if (!lastName.trim()) found.lastName = t('profile_name_required');
        if (Object.keys(found).length) {
            setErrors(found);
            focusFirstError(found as Record<string, string>);
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
            const data = (e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
            const server: Partial<Record<FormKey, string>> = {};
            for (const [key, messages] of Object.entries(data?.errors ?? {})) {
                if (SERVER_FIELDS[key] && messages[0]) server[SERVER_FIELDS[key]] = messages[0];
            }
            if (Object.keys(server).length) {
                setErrors(server);
                focusFirstError(server as Record<string, string>);
            } else {
                showFormError(data?.message ?? t('profile_save_failed'));
            }
        }
    };

    const tabs: DialogTab<TabId>[] = [
        { id: 'profile', label: t('profile_tab_details'), icon: UserRound },
        ...(seesAssets
            ? [{ id: 'assets' as const, label: t('profile_tab_assets'), icon: Box, count: assetsLoading ? undefined : myAssets.length }]
            : []),
        ...(seesTickets
            ? [{ id: 'tickets' as const, label: t('profile_tab_tickets'), icon: Ticket, count: ticketsLoading ? undefined : myTickets?.meta?.total }]
            : []),
        ...(seesAccess
            ? [{ id: 'access' as const, label: t('profile_tab_access'), icon: Shield, count: accessLoading ? undefined : accessRows.length }]
            : []),
    ];

    const textField = (key: FormKey, label: string, props: React.ComponentProps<typeof Input> = {}) => (
        <Field label={label} name={key} error={errors[key]} required={key === 'firstName' || key === 'lastName'}>
            <Input value={fields[key]} onChange={edit(key)} disabled={!canEdit} {...props} />
        </Field>
    );

    const seeAll = (to: string) => (
        <Link to={to} onClick={leaveTo(to)} className="text-brand mt-4 inline-block text-sm font-medium hover:underline">
            {t('profile_see_all')}
        </Link>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent className="flex h-[88dvh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
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

                {/* Cover */}
                <div className="border-border flex shrink-0 items-center gap-4 border-b bg-[radial-gradient(120%_160%_at_0%_0%,var(--accent)_0%,var(--card)_60%)] px-5 pt-6 pb-5 lg:gap-5 lg:px-7">
                    <div className="relative shrink-0">
                        <UserAvatar
                            name={nameEn}
                            photoUrl={photoUrl ?? user.photo_url}
                            className="ring-card h-[72px] w-[72px] shadow-md ring-2"
                            textClassName="text-2xl"
                        />
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                aria-label={t('profile_change_photo')}
                                title={t('profile_change_photo')}
                                className="border-card bg-brand text-brand-foreground focus-visible:ring-ring absolute -right-1 -bottom-1 flex h-8 w-8 items-center justify-center rounded-full border-2 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                            >
                                <Camera className="h-3.5 w-3.5" aria-hidden />
                            </button>
                        )}
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            tabIndex={-1}
                            aria-hidden
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
                    {/* Rail: facts nobody edits here */}
                    <aside className="border-border flex w-[232px] shrink-0 flex-col gap-5 overflow-y-auto border-r p-4 xl:w-[300px] xl:p-5">
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
                            <RailFact icon={Hash} label={t('joined')} value={fmt.date(emp?.joined_at)} mono />
                        </RailSection>
                    </aside>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <DialogTabs className="px-2 pt-1 lg:px-3" tabs={tabs} active={tab} onChange={setTab} label={t('profile')} panelId={panelId} />

                        <div
                            role="tabpanel"
                            id={panelId}
                            aria-labelledby={dialogTabId(panelId, tab)}
                            className="min-h-0 flex-1 overflow-y-auto p-4 xl:p-5"
                        >
                            {tab === 'profile' && (
                                <div className="max-w-xl space-y-4">
                                    <FormErrorBanner message={formError} shakeKey={formErrorCount} />
                                    <div className="grid grid-cols-2 gap-3">
                                        {textField('firstName', t('emp_first_name'), { autoComplete: 'given-name' })}
                                        {textField('lastName', t('emp_last_name'), { autoComplete: 'family-name' })}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {textField('firstNameTh', t('emp_first_name_th'), { autoComplete: 'off' })}
                                        {textField('lastNameTh', t('emp_last_name_th'), { autoComplete: 'off' })}
                                    </div>
                                    {textField('phone', t('emp_phone'), {
                                        type: 'tel',
                                        inputMode: 'tel',
                                        autoComplete: 'tel',
                                        className: 'font-mono',
                                    })}
                                </div>
                            )}

                            {tab === 'assets' &&
                                (assetsLoading ? (
                                    <LoadingRows />
                                ) : myAssets.length === 0 ? (
                                    <EmptyPane icon={Box} text={t('profile_no_assets')} />
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
                                        {seeAll('/my-assets-access')}
                                    </>
                                ))}

                            {tab === 'tickets' &&
                                (ticketsLoading ? (
                                    <LoadingRows />
                                ) : ticketRows.length === 0 ? (
                                    <EmptyPane icon={Ticket} text={t('profile_no_tickets')} />
                                ) : (
                                    <>
                                        {ticketRows.map((tk) => (
                                            <ItemRow
                                                key={tk.id}
                                                icon={Ticket}
                                                title={tk.subject}
                                                sub={tk.ticket_no}
                                                right={<span className="text-muted-foreground shrink-0 text-xs">{fmt.date(tk.created_at)}</span>}
                                            />
                                        ))}
                                        {seeAll('/tickets?tab=my')}
                                    </>
                                ))}

                            {tab === 'access' &&
                                (accessLoading ? (
                                    <LoadingRows />
                                ) : accessRows.length === 0 ? (
                                    <EmptyPane icon={Shield} text={t('profile_no_access')} />
                                ) : (
                                    <>
                                        {accessRows.map((r) => (
                                            <ItemRow key={r.key} icon={Shield} title={r.name} sub={r.sub} />
                                        ))}
                                        {seeAll('/my-assets-access')}
                                    </>
                                ))}
                        </div>
                    </div>
                </div>

                {/* Save belongs to the details tab; the others are read-only */}
                <div className="border-border flex shrink-0 items-center justify-end gap-3 border-t px-5 py-4 lg:px-7">
                    {/* Opens over the drawer (?dialog=password); the drawer and its edits stay underneath */}
                    <Button variant="outline" className="mr-auto" onClick={onChangePassword}>
                        <KeyRound className="h-4 w-4" aria-hidden />
                        {t('pwd_change_title')}
                    </Button>
                    <Button variant="outline" onClick={() => guardClose(onClose)}>
                        {t('close')}
                    </Button>
                    {canEdit && tab === 'profile' && <SaveButton onClick={save} loading={update.isPending} success={saved} />}
                </div>
            </DialogContent>
        </Dialog>
    );
}
