import { useT } from '@/lang';
import { useSettings } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, focusFirstError } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { ArrowLeft, ArrowRight, Briefcase, Check, Info, KeyRound, Laptop, Mail, Smartphone, Upload, User } from 'lucide-react';
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

const STEP_ICONS = [User, Briefcase, KeyRound];

/** Stepped right-side Sheet for adding a new employee (3 steps: personal, work, access). */
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
        };
        try {
            await create.mutateAsync(payload);
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
        if (!validateStep(1) || !validateStep(2)) return;
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

    const steps = [t('emp_personal_info'), t('emp_work_info'), t('emp_access')];

    return (
        <>
            <Sheet
                open={open}
                onOpenChange={(o) => {
                    if (!o) onClose();
                }}
            >
                <SheetContent side="right" className="flex w-[600px] flex-col sm:max-w-[600px]">
                    {/* Always mounted (imageSrc toggles) so the crop dialog can animate closed. */}
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
                    <SheetHeader>
                        <SheetTitle>{t('add_employee')}</SheetTitle>
                        <SheetDescription>
                            {t('emp_step')} {step} {t('emp_of')} 3
                        </SheetDescription>
                    </SheetHeader>

                    {/* Step indicator with icons */}
                    <div className="flex gap-2 py-4">
                        {steps.map((label, i) => {
                            const n = i + 1;
                            const done = n < step;
                            const active = n === step;
                            const Icon = STEP_ICONS[i];
                            const canJump = n !== step;

                            const handleJump = () => {
                                if (!canJump) return;
                                if (n < step) {
                                    setStep(n);
                                } else {
                                    let valid = true;
                                    for (let s = step; s < n; s++) {
                                        if (!validateStep(s)) {
                                            valid = false;
                                            break;
                                        }
                                    }
                                    if (valid) setStep(n);
                                }
                            };

                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={handleJump}
                                    className={cn(
                                        'flex-1 rounded-lg border p-2.5 text-left transition-colors',
                                        active
                                            ? 'border-brand bg-brand/5'
                                            : done
                                              ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10'
                                              : 'border-border hover:bg-accent/50',
                                        canJump && 'cursor-pointer',
                                        !canJump && 'cursor-default',
                                    )}
                                >
                                    <div
                                        className={cn(
                                            'flex items-center gap-1.5',
                                            active ? 'text-brand' : done ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                                        )}
                                    >
                                        {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                                        <span className="font-mono text-[11px] font-bold">0{n}</span>
                                    </div>
                                    <div className={cn('mt-0.5 text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                                        {label}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* px-1 keeps the input focus ring from being clipped by the scroll container */}
                    <div
                        className="flex-1 space-y-5 overflow-y-auto px-1 py-1"
                        onKeyDown={(e) => {
                            if (e.key !== 'Enter' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
                            e.preventDefault();
                            if (step < 3) next();
                            else void submit();
                        }}
                    >
                        {step === 1 && (
                            <>
                                <div className="flex items-center gap-4">
                                    <UserAvatar
                                        name={`${form.firstName} ${form.lastName}`}
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

                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={t('emp_first_name')} required name="firstName" error={errors.firstName}>
                                        <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
                                    </Field>
                                    <Field label={t('emp_last_name')} required name="lastName" error={errors.lastName}>
                                        <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} placeholder="Doe" />
                                    </Field>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label={t('emp_first_name_th')}>
                                        <Input value={form.firstNameTh} onChange={(e) => set('firstNameTh', e.target.value)} placeholder="สมชาย" />
                                    </Field>
                                    <Field label={t('emp_last_name_th')}>
                                        <Input value={form.lastNameTh} onChange={(e) => set('lastNameTh', e.target.value)} placeholder="สุขสวัสดิ์" />
                                    </Field>
                                </div>
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
                            </>
                        )}

                        {step === 2 && (
                            <>
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
                                <div className="grid grid-cols-2 gap-3">
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
                            </>
                        )}

                        {step === 3 && (
                            <>
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

                                <div>
                                    <div className="text-sm font-semibold">{t('emp_onboarding_title')}</div>
                                    <div className="text-muted-foreground mb-3 text-xs">{t('emp_onboarding_sub')}</div>
                                    <div className="grid grid-cols-1 gap-2">
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

                    <SheetFooter className="flex-row items-center gap-2">
                        <Button variant="outline" onClick={onClose}>
                            {t('cancel')}
                        </Button>
                        <div className="flex-1" />
                        {step > 1 && (
                            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
                                <ArrowLeft className="h-4 w-4" />
                                {t('back')}
                            </Button>
                        )}
                        {step < 3 ? (
                            <Button onClick={next}>
                                {t('next')}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button onClick={submit} disabled={create.isPending}>
                                <Check className="h-4 w-4" />
                                {t('save')}
                            </Button>
                        )}
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </>
    );
}
