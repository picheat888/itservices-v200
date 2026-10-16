// My Profile drawer: cover, read-only rail, and tabs (details form, assets, tickets, requests, access) held in ?section=.
import { useT } from '@/lang';
import { useMyAccess } from '@/modules/access';
import { useMyAssets } from '@/modules/asset';
import { useAuth, useUpdateProfile } from '@/modules/auth';
import { AccessPane, IdChip, PhotoCropDialog, RAIL_HEADING, RailRow, RequestsPane, TicketsPane, useEmployee } from '@/modules/employee';
import { useRequests } from '@/modules/request';
import { useTickets } from '@/modules/ticket';
import { dialogTabId, DialogTabs, type DialogTab } from '@/shared/components/dialog-tabs';
import { SaveButton } from '@/shared/components/save-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { User } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { AtSign, Box, Briefcase, Building2, Camera, Hash, Inbox, KeyRound, Phone, Shield, Ticket, UserCheck, UserRound, Users } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProfileSection } from '../hooks/use-profile-section';
import { PROFILE_SECTIONS, type ProfileSection } from '../types';
import { MyAssetsTab } from './my-assets-tab';
import { ProfileDetailsTab, type ProfileFormKey } from './profile-details-tab';

// Names are stored as one space-joined string: the first word is the given name, the rest the surname
function splitName(full: string | null | undefined): [string, string] {
    const parts = (full ?? '').trim().split(' ');
    return [parts[0] ?? '', parts.slice(1).join(' ')];
}

/** The editable fields as the form is seeded from the user — also the baseline for unsaved changes. */
function profileFields(user: User): Record<ProfileFormKey, string> {
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

/** API field name → form field, for showing a server error under its field. */
const SERVER_FIELDS: Record<string, ProfileFormKey> = {
    first_name: 'firstName',
    last_name: 'lastName',
    first_name_th: 'firstNameTh',
    last_name_th: 'lastNameTh',
    phone: 'phone',
};

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div className={RAIL_HEADING}>{title}</div>
            {children}
        </section>
    );
}

/** How many of your own tickets / requests the tabs hold. */
const TAB_ROWS = 50;

export function ProfileDrawer({ open, onClose, onChangePassword }: { open: boolean; onClose: () => void; onChangePassword: () => void }) {
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
    const sees: Record<ProfileSection, boolean> = {
        profile: true,
        assets: can('assets.my'),
        tickets: can('tickets.my'),
        requests: can('requests.submit'),
        access: can('access.my'),
    };
    const allowed = PROFILE_SECTIONS.filter((s) => sees[s]);
    const [tab, setTab] = useProfileSection(allowed);

    const { data: myAssets = [], isLoading: assetsLoading } = useMyAssets(open && sees.assets);
    const { data: myAccess, isLoading: accessLoading } = useMyAccess(open && sees.access);
    const { data: myTickets, isLoading: ticketsLoading } = useTickets({ page: 1, per_page: TAB_ROWS, requested: true }, open && sees.tickets);
    const { data: myRequests, isLoading: requestsLoading } = useRequests({ page: 1, per_page: TAB_ROWS, scope: 'mine' }, open && sees.requests);

    // Copy buttons in the rail, announced like the Employee viewer's
    const [copied, setCopied] = useState<string | null>(null);
    const copy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            return;
        }
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    };

    const [fields, setFields] = useState<Record<ProfileFormKey, string>>({ firstName: '', lastName: '', firstNameTh: '', lastNameTh: '', phone: '' });
    const [errors, setErrors] = useState<Partial<Record<ProfileFormKey, string>>>({});
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
    const section = lang === 'th' ? (emp?.section_th ?? emp?.section) : emp?.section;
    const manager = lang === 'th' ? (emp?.manager_name_th ?? emp?.manager_name) : emp?.manager_name;

    const accessCount = myAccess
        ? myAccess.email_groups.length + myAccess.file_shares.length + myAccess.social.length + myAccess.software.length
        : undefined;

    const showFormError = (message: string) => {
        setFormError(message);
        setFormErrorCount((n) => n + 1);
    };

    const edit = (key: ProfileFormKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const found: Partial<Record<ProfileFormKey, string>> = {};
        if (!firstName.trim()) found.firstName = t('profile_name_required');
        if (!lastName.trim()) found.lastName = t('profile_last_name_required');
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
            const server: Partial<Record<ProfileFormKey, string>> = {};
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

    // Tab bar, in PROFILE_SECTIONS order
    const tabMeta: Record<ProfileSection, Omit<DialogTab<ProfileSection>, 'id'>> = {
        profile: { label: t('profile_tab_details'), icon: UserRound },
        assets: {
            label: t('emp_v_tab_assets'),
            icon: Box,
            count: assetsLoading ? undefined : myAssets.length,
            dot: myAssets.some((a) => a.status === 'pending_acceptance'),
        },
        tickets: { label: t('emp_v_tab_tickets'), icon: Ticket, count: ticketsLoading ? undefined : myTickets?.meta?.total },
        requests: { label: t('requests'), icon: Inbox, count: requestsLoading ? undefined : myRequests?.meta?.total },
        access: { label: t('emp_v_tab_access'), icon: Shield, count: accessCount },
    };
    const tabs: DialogTab<ProfileSection>[] = allowed.map((id) => ({ id, ...tabMeta[id] }));

    const seeAll = (to: string) => (
        <Link to={to} onClick={leaveTo(to)} className="text-brand mt-3 inline-block shrink-0 self-start text-sm font-medium hover:underline">
            {t('profile_see_all')}
        </Link>
    );

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent className="flex h-[88dvh] max-h-[780px] w-[96vw] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-2xl p-0">
                <DialogTitle className="sr-only">{t('profile')}</DialogTitle>
                <span role="status" aria-live="polite" className="sr-only">
                    {copied ? t('cred_copied') : ''}
                </span>
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
                            {emp?.code && (
                                <IdChip icon={Hash} mono>
                                    {emp.code}
                                </IdChip>
                            )}
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
                            <RailRow
                                icon={<AtSign className="h-3.5 w-3.5" />}
                                label={t('login_email')}
                                value={user.email}
                                copied={copied === 'email'}
                                onCopy={(v) => copy(v, 'email')}
                            />
                            <RailRow
                                icon={<Phone className="h-3.5 w-3.5" />}
                                label={t('emp_phone')}
                                value={phone}
                                mono
                                copied={copied === 'phone'}
                                onCopy={(v) => copy(v, 'phone')}
                            />
                        </RailSection>
                        <RailSection title={t('profile_account')}>
                            <RailRow
                                icon={<KeyRound className="h-3.5 w-3.5" />}
                                label={t('emp_username')}
                                value={user.username}
                                mono
                                copied={copied === 'user'}
                                onCopy={(v) => copy(v, 'user')}
                            />
                            <RailRow
                                icon={<Shield className="h-3.5 w-3.5" />}
                                label={t('permission_level')}
                                value={user.group_name ?? user.role_label}
                            />
                        </RailSection>
                        <RailSection title={t('profile_details')}>
                            <RailRow icon={<Users className="h-3.5 w-3.5" />} label={t('emp_section')} value={section} />
                            <RailRow icon={<Building2 className="h-3.5 w-3.5" />} label={t('department')} value={department} />
                            <RailRow icon={<Briefcase className="h-3.5 w-3.5" />} label={t('position')} value={emp?.position} />
                            <RailRow icon={<UserCheck className="h-3.5 w-3.5" />} label={t('emp_manager')} value={manager} />
                        </RailSection>
                    </aside>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <DialogTabs className="px-2 pt-1 lg:px-3" tabs={tabs} active={tab} onChange={setTab} label={t('profile')} panelId={panelId} />

                        <div
                            role="tabpanel"
                            id={panelId}
                            aria-labelledby={dialogTabId(panelId, tab)}
                            // Table tabs size their rows to the pane (fillHeight), like the Employee viewer
                            className={cn('min-h-0 flex-1 p-4 xl:p-5', tab === 'tickets' || tab === 'requests' ? 'flex flex-col' : 'overflow-y-auto')}
                        >
                            {tab === 'profile' && (
                                <ProfileDetailsTab
                                    fields={fields}
                                    errors={errors}
                                    canEdit={canEdit}
                                    emp={emp}
                                    formError={formError}
                                    formErrorCount={formErrorCount}
                                    onEdit={edit}
                                />
                            )}

                            {tab === 'assets' && (
                                <MyAssetsTab
                                    assets={myAssets}
                                    loading={assetsLoading}
                                    linked={!!user.employee_code}
                                    canReturn={can('assets.return')}
                                />
                            )}
                            {tab === 'tickets' && (
                                <>
                                    <TicketsPane tickets={myTickets?.data ?? []} loading={ticketsLoading} emptyText={t('profile_no_tickets')} />
                                    {(myTickets?.data.length ?? 0) > 0 && seeAll('/tickets?tab=my')}
                                </>
                            )}
                            {tab === 'requests' && (
                                <>
                                    <RequestsPane requests={myRequests?.data ?? []} loading={requestsLoading} emptyText={t('profile_no_requests')} />
                                    {(myRequests?.data.length ?? 0) > 0 && seeAll('/requests?tab=all')}
                                </>
                            )}
                            {tab === 'access' && <AccessPane access={myAccess} loading={accessLoading} emptyText={t('profile_no_access')} />}
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
