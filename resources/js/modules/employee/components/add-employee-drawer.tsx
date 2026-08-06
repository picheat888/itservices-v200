import { useT } from '@/lang';
import { useSettings } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, focusFirstError } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Briefcase, Check, ChevronLeft, ChevronRight, Info, KeyRound, Laptop, Loader2, Mail, Smartphone, Upload, User, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { useEmployeeMutations, useEmployees } from '../hooks/use-employees';
import { usePositions } from '../hooks/use-positions';
import { useSections } from '../hooks/use-sections';
import { PhotoCropDialog } from './photo-crop-dialog';

const empty = {
    firstName: '',
    lastName: '',
    firstNameTh: '',
    lastNameTh: '',
    email: '',
    phone: '',
    code: '',
    departmentId: '',
    sectionId: '',
    positionId: '',
    managerId: '',
    joinedAt: '',
    services: [] as string[],
    onboardingNote: '',
};

const SERVICES = [
    { v: 'computer', icon: Laptop, labelKey: 'req_computer' },
    { v: 'mobile', icon: Smartphone, labelKey: 'req_mobile' },
    { v: 'email', icon: Mail, labelKey: 'req_email' },
] as const;

/** The three steps of the wizard: icon for the stepper, heading + sub-line for the body. */
const STEPS = [
    { icon: User, titleKey: 'emp_personal_info', subKey: 'emp_personal_sub' },
    { icon: Briefcase, titleKey: 'emp_work_info', subKey: 'emp_work_sub' },
    { icon: KeyRound, titleKey: 'emp_access', subKey: 'emp_access_sub' },
] as const;

const LAST_STEP = STEPS.length;

/**
 * Focus Dialog wizard for adding a new employee — 3 steps: personal info, work info,
 * access. Same centered shell as the Edit dialog (`FocusDialogHeader` + `border-t
 * bg-muted/30` footer) with the horizontal numbered stepper the Contract and Request
 * wizards use, so adding and editing a person no longer look like two different apps.
 *
 * Only the presentation changed in the move from the old right-side sheet: the form
 * state, the per-step validation, the special-position rule, the 422 field mapping and
 * the payload are all as they were.
 */
export function AddEmployeeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();
    const { data: employees = [] } = useEmployees();
    const { create } = useEmployeeMutations();
    const { data: settings } = useSettings();
    const pushToast = useToastStore((s) => s.push);

    const [step, setStep] = useState(1);
    const [form, setForm] = useState(empty);
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setPhoto(null);
        setCropSrc(null);
        setPhotoError(null);
        setErrors({});
        setForm(empty);
    }, [open]);

    const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
    useEffect(
        () => () => {
            if (photo && photoUrl) URL.revokeObjectURL(photoUrl);
        },
        [photo, photoUrl],
    );

    /** Update one field and drop its validation error — editing counts as fixing it. */
    const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((prev) => {
            if (!(k in prev)) return prev;
            const next = { ...prev };
            delete next[k];
            return next;
        });
    };

    /** When department changes, clear the section so stale options don't persist. */
    const setDepartment = (v: string) => {
        setForm((f) => ({ ...f, departmentId: v, sectionId: '' }));
        setErrors((prev) => {
            if (!('departmentId' in prev)) return prev;
            const next = { ...prev };
            delete next.departmentId;
            return next;
        });
    };

    // All employees are manager candidates when adding a new employee.
    const managerOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: String(e.id),
                label: lang === 'th' ? (e.name_th ?? e.name) : e.name,
                hint: e.position ?? undefined,
                avatar: e.photo_url,
                sub: e.code,
                search: `${e.name} ${e.name_th ?? ''} ${e.code} ${e.position ?? ''}`,
            })),
        [employees, lang],
    );

    // A "special position" skips both the Department and Report-to requirements.
    const posIsSpecial = positions.find((p) => String(p.id) === form.positionId)?.allow_special_position ?? false;

    /** Validates personal info (step 1) or employment info (step 2). */
    const validateStep = (s: number) => {
        const e: Record<string, string> = {};
        if (s === 1) {
            if (!form.firstName.trim()) e.firstName = t('emp_err_first');
            if (!form.lastName.trim()) e.lastName = t('emp_err_last');
            // ASCII-only practical pattern — rejects unicode (สมชาย@…), double @, and spaces up front.
            if (form.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(form.email)) e.email = t('emp_err_email');
            // Optional, but once filled it has to be a number — free-form so "ext. 1305" is
            // allowed, matching a ticket's callback phone.
            if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 3) e.phone = t('emp_err_phone');
        }
        if (s === 2) {
            if (!form.departmentId && !posIsSpecial) e.departmentId = t('emp_err_dept');
            if (!form.sectionId && !posIsSpecial) e.sectionId = t('emp_err_section');
            if (!form.positionId) e.positionId = t('emp_err_pos');
            if (!form.managerId && !posIsSpecial) e.managerId = t('emp_err_manager');
            if (!form.joinedAt) e.joinedAt = t('emp_err_start');
        }
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    const next = () => {
        if (validateStep(step)) setStep((s) => s + 1);
    };

    /** Stepper click: back is always allowed, forward only through steps that validate. */
    const goToStep = (target: number) => {
        if (target === step) return;
        if (target < step) {
            setStep(target);
            return;
        }
        for (let s = step; s < target; s++) {
            if (!validateStep(s)) return;
        }
        setStep(target);
    };

    /** Builds the payload and commits the create mutation. */
    const persist = async () => {
        const payload = {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            first_name_th: form.firstNameTh.trim() || null,
            last_name_th: form.lastNameTh.trim() || null,
            code: form.code.trim() || undefined,
            department_id: form.departmentId ? Number(form.departmentId) : null,
            section_id: form.sectionId ? Number(form.sectionId) : null,
            position_id: form.positionId ? Number(form.positionId) : null,
            manager_id: form.managerId ? Number(form.managerId) : null,
            email: form.email || null,
            username: null,
            phone: form.phone || null,
            joined_at: form.joinedAt || null,
            photo: photo ?? null,
            // Ticked services are filed as service requests on the new employee's
            // behalf, once the record exists.
            services: form.services,
            onboarding_note: form.onboardingNote.trim() || null,
        };
        try {
            const { onboarding } = await create.mutateAsync(payload);

            // The employee is saved either way, so a service that could not be filed
            // has to be said out loud rather than silently dropped.
            if (onboarding?.failed.length) {
                pushToast(t('emp_onboarding_failed').replace('{services}', onboarding.failed.map((f) => f.service).join(', ')));
            } else if (onboarding?.created.length) {
                pushToast(t('emp_onboarding_filed').replace('{n}', String(onboarding.created.length)));
            }
            onClose();
        } catch (err) {
            // Map Laravel's snake_case field errors onto the form's camelCase error slots
            // so they render under the matching inputs; the toast stays as a catch-all
            // (the failing field may sit on another step of this wizard).
            const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
            if (fieldErrors) {
                const mapped: Record<string, string> = {};
                for (const [key, msgs] of Object.entries(fieldErrors)) {
                    mapped[key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] = msgs[0] ?? '';
                }
                setErrors((prev) => ({ ...prev, ...mapped }));
                pushToast(Object.values(fieldErrors)[0]?.[0] ?? t('emp_save_failed'));
            } else {
                throw err;
            }
        }
    };

    /** Validate both sections then save. */
    const submit = async () => {
        if (!validateStep(1)) {
            setStep(1);
            return;
        }
        if (!validateStep(2)) {
            setStep(2);
            return;
        }
        await persist();
    };

    const onPhoto = (file?: File) => {
        setPhotoError(null);
        if (!file) return;
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            setPhotoError(t('emp_photo_err_type'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setPhotoError(t('emp_photo_err_size'));
            return;
        }
        setCropSrc(URL.createObjectURL(file));
    };

    const typedName = `${form.firstName} ${form.lastName}`.trim();

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className={focusDialogContentClass}
                onKeyDown={(e) => {
                    // Skip Enter-to-advance when focus sits on something with its own
                    // handler (the stepper, a service card, a select) — otherwise pressing
                    // Enter would both toggle that control and move to the next step.
                    const tag = (e.target as HTMLElement).tagName;
                    if (e.key !== 'Enter' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'OPTION') return;
                    e.preventDefault();
                    if (step < LAST_STEP) next();
                    else void submit();
                }}
            >
                {/* PhotoCropDialog is its own (nested) Radix dialog, so it portals itself out
                    and becomes the active layer — placement here is fine, not inerted.
                    Always mounted (imageSrc toggles) so it can animate closed. */}
                <PhotoCropDialog
                    imageSrc={cropSrc}
                    onConfirm={(cropped) => {
                        setPhoto(cropped);
                        if (cropSrc) URL.revokeObjectURL(cropSrc);
                        setCropSrc(null);
                    }}
                    onCancel={() => {
                        if (cropSrc) URL.revokeObjectURL(cropSrc);
                        setCropSrc(null);
                    }}
                />

                <FocusDialogHeader
                    icon={UserPlus}
                    eyebrow={t('add_employee')}
                    title={typedName || t('emp_new_person')}
                    srDescription={t('add_employee')}
                />

                {/* Horizontal stepper */}
                <div className="border-border/60 flex items-start border-b px-6 pb-4">
                    {STEPS.map((s, i) => {
                        const n = i + 1;
                        const active = n === step;
                        const done = n < step;
                        const Icon = s.icon;
                        return (
                            <button
                                key={s.titleKey}
                                type="button"
                                onClick={() => goToStep(n)}
                                className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
                            >
                                {i < STEPS.length - 1 && (
                                    <span
                                        className={cn(
                                            'absolute top-[13px] right-[calc(-50%+17px)] left-[calc(50%+17px)] h-0.5 rounded-full',
                                            done ? 'bg-brand' : 'bg-border',
                                        )}
                                    />
                                )}
                                <span
                                    className={cn(
                                        'bg-background z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] text-xs font-bold transition-colors',
                                        active && 'border-brand bg-brand text-brand-foreground',
                                        done && 'border-brand/40 bg-brand/10 text-brand',
                                        !active && !done && 'border-input text-muted-foreground',
                                    )}
                                >
                                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                                </span>
                                <span
                                    className={cn(
                                        'text-[11.5px] leading-tight font-semibold transition-colors',
                                        active ? 'text-brand' : done ? 'text-foreground' : 'text-muted-foreground',
                                    )}
                                >
                                    {t(s.titleKey)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Body — only this scrolls */}
                <div className="flex-1 overflow-y-auto px-6 py-7">
                    <div key={step} className="animate-in fade-in-0 slide-in-from-bottom-2 mx-auto w-full max-w-[860px] space-y-6 duration-300">
                        <StepHead
                            eyebrow={t('emp_step_n').replace('{n}', String(step))}
                            title={t(STEPS[step - 1].titleKey)}
                            sub={t(STEPS[step - 1].subKey)}
                        />

                        {/* ── Step 1 · Personal info ─────────────────── */}
                        {step === 1 && (
                            <>
                                <div className="border-border/60 flex items-center gap-4 rounded-xl border p-4">
                                    <UserAvatar
                                        name={typedName}
                                        photoUrl={photoUrl}
                                        className="h-16 w-16"
                                        textClassName="text-lg"
                                        fallbackIcon={<User className="h-6 w-6" />}
                                    />
                                    <div>
                                        <label className="border-input bg-background hover:bg-accent inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
                                            <Upload className="h-4 w-4" />
                                            {photo ? t('emp_photo_change') : t('emp_photo')}
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg"
                                                className="hidden"
                                                onChange={(e) => onPhoto(e.target.files?.[0])}
                                            />
                                        </label>
                                        {photo && (
                                            <button onClick={() => setPhoto(null)} className="text-destructive ml-2 text-sm hover:underline">
                                                {t('emp_photo_remove')}
                                            </button>
                                        )}
                                        {photoError ? (
                                            <p className="text-destructive mt-2 text-xs">{photoError}</p>
                                        ) : (
                                            <p className="text-muted-foreground mt-2 text-xs">{t('emp_photo_help')}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Row-wise: English names, then Thai names, then contact. */}
                                <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                                    <Field label={t('emp_first_name')} required name="firstName" error={errors.firstName}>
                                        <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
                                    </Field>
                                    <Field label={t('emp_last_name')} required name="lastName" error={errors.lastName}>
                                        <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
                                    </Field>
                                    <Field label={t('emp_first_name_th')}>
                                        <Input value={form.firstNameTh} onChange={(e) => set('firstNameTh', e.target.value)} placeholder="สมชาย" />
                                    </Field>
                                    <Field label={t('emp_last_name_th')}>
                                        <Input value={form.lastNameTh} onChange={(e) => set('lastNameTh', e.target.value)} placeholder="สุขสวัสดิ์" />
                                    </Field>
                                    <Field label={t('emp_email')} name="email" error={errors.email}>
                                        <Input
                                            className="font-mono"
                                            value={form.email}
                                            onChange={(e) => set('email', e.target.value)}
                                            placeholder="john.doe@example.com"
                                        />
                                    </Field>
                                    <Field label={t('emp_phone')} name="phone" error={errors.phone}>
                                        <Input
                                            className="font-mono"
                                            value={form.phone}
                                            onChange={(e) => set('phone', e.target.value)}
                                            placeholder="+66 81 234 5678 / ext. 1305"
                                            inputMode="tel"
                                        />
                                    </Field>
                                </div>
                            </>
                        )}

                        {/* ── Step 2 · Work info ─────────────────────── */}
                        {step === 2 && (
                            <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                                {/* LEFT: the unit they belong to. */}
                                <div className="flex flex-col gap-4">
                                    <Field label={t('department')} required={!posIsSpecial} name="departmentId" error={errors.departmentId}>
                                        <Select value={form.departmentId} onValueChange={setDepartment}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departments.map((d) => (
                                                    <SelectItem key={d.id} value={String(d.id)}>
                                                        {lang === 'th' ? (d.name_th ?? d.name) : d.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <Field label={t('emp_section')} required={!posIsSpecial} name="sectionId" error={errors.sectionId}>
                                        <SearchableSelect
                                            value={form.sectionId}
                                            onChange={(v) => set('sectionId', v)}
                                            options={
                                                form.departmentId
                                                    ? sections.map((s) => ({
                                                          value: String(s.id),
                                                          label: lang === 'th' ? (s.name_th ?? s.name) : s.name,
                                                          search: `${s.name} ${s.name_th ?? ''}`,
                                                      }))
                                                    : []
                                            }
                                            clearable
                                        />
                                    </Field>
                                    <Field label={t('position')} required name="positionId" error={errors.positionId}>
                                        <Select value={form.positionId} onValueChange={(v) => set('positionId', v)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="—" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {positions.map((p) => (
                                                    <SelectItem key={p.id} value={String(p.id)}>
                                                        {p.title}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                </div>

                                {/* RIGHT: reporting line and the dates/ids that identify them. */}
                                <div className="flex flex-col gap-4">
                                    <Field
                                        label={t('emp_manager')}
                                        help={t('emp_manager_help')}
                                        required={!posIsSpecial}
                                        name="managerId"
                                        error={errors.managerId}
                                    >
                                        <SearchableSelect
                                            value={form.managerId}
                                            onChange={(v) => set('managerId', v)}
                                            options={managerOptions}
                                            clearable
                                        />
                                    </Field>
                                    <Field label={t('emp_start_date')} required name="joinedAt" error={errors.joinedAt}>
                                        <DateInput value={form.joinedAt} onChange={(v) => set('joinedAt', v)} />
                                    </Field>
                                    <Field label={t('emp_employee_id')} help={t('emp_id_help')}>
                                        <Input
                                            className="font-mono"
                                            value={form.code}
                                            onChange={(e) => set('code', e.target.value)}
                                            placeholder={t('emp_id_auto')}
                                        />
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ── Step 3 · Access ────────────────────────── */}
                        {step === 3 && (
                            <>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="bg-brand/5 flex items-start gap-2.5 rounded-lg p-3">
                                        <Info className="text-brand mt-0.5 h-4 w-4 shrink-0" />
                                        <div>
                                            <div className="text-foreground text-sm font-medium">
                                                {t('emp_default_role_title')}: {settings?.default_employee_role_label ?? 'Employee'}
                                            </div>
                                            <div className="text-muted-foreground text-xs">{t('emp_default_role_notice')}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3">
                                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                        <div>
                                            <div className="text-foreground text-sm font-medium">{t('emp_account_pending_title')}</div>
                                            <div className="text-muted-foreground mt-0.5 text-xs">{t('emp_account_pending_desc')}</div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-sm font-semibold">{t('emp_onboarding_title')}</div>
                                    <div className="text-muted-foreground mb-3 text-xs">{t('emp_onboarding_sub')}</div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {SERVICES.map(({ v, icon: Icon, labelKey }) => {
                                            const on = form.services.includes(v);
                                            return (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => set('services', on ? form.services.filter((x) => x !== v) : [...form.services, v])}
                                                    className={cn(
                                                        'flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors',
                                                        on ? 'border-brand bg-brand/5' : 'border-border hover:bg-accent/50',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'flex h-8 w-8 items-center justify-center rounded-md',
                                                            on ? 'bg-brand text-white' : 'bg-muted text-muted-foreground',
                                                        )}
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                    </span>
                                                    <span className="flex-1 text-sm font-medium">{t(labelKey)}</span>
                                                    <span
                                                        className={cn(
                                                            'flex h-4 w-4 items-center justify-center rounded border',
                                                            on ? 'border-brand bg-brand text-white' : 'border-input',
                                                        )}
                                                    >
                                                        {on && <Check className="h-3 w-3" />}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {form.services.length > 0 && (
                                    <Field label={t('emp_onboarding_note')}>
                                        <Input value={form.onboardingNote} onChange={(e) => set('onboardingNote', e.target.value)} />
                                    </Field>
                                )}

                                <p className="text-muted-foreground text-xs">{t('emp_onboarding_deferred')}</p>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer — Cancel/Back · step dots · Next/Save */}
                <div className="border-border/60 bg-muted/30 flex items-center gap-3 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={step === 1 ? onClose : () => setStep((s) => s - 1)} disabled={create.isPending}>
                        {step === 1 ? (
                            t('cancel')
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" />
                                {t('back')}
                            </>
                        )}
                    </Button>

                    <div className="mx-auto flex gap-1.5">
                        {STEPS.map((s, i) => (
                            <span
                                key={s.titleKey}
                                className={cn('h-1.5 rounded-full transition-all', i + 1 === step ? 'bg-brand w-5' : 'bg-border w-1.5')}
                            />
                        ))}
                    </div>

                    {step < LAST_STEP ? (
                        <Button onClick={next}>
                            {t('next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={create.isPending}>
                            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {create.isPending ? t('saving') : t('save')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Per-step heading: small step number, bold title, muted subtitle. */
function StepHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
    return (
        <div>
            <p className="text-brand text-xs font-bold tracking-wide uppercase">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{sub}</p>
        </div>
    );
}
