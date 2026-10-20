import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localLabel, localName } from '@/shared/lib/local-name';
import { cn, focusFirstError, isEmail } from '@/shared/lib/utils';
import type { EmployeeOption } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, DialogFooterBar, focusDialogContentClass } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    AlertTriangle,
    Briefcase,
    Check,
    ChevronLeft,
    ChevronRight,
    KeyRound,
    Laptop,
    Loader2,
    Mail,
    Smartphone,
    Upload,
    User,
    UserPlus,
} from 'lucide-react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingServiceField } from '../api/employeeApi';
import { useDepartments } from '../hooks/use-departments';
import { useEmployeePicker, useEmployeesByIds } from '../hooks/use-employee-pickers';
import { useEmployeeMutations } from '../hooks/use-employees';
import { useOnboardingPrecheck } from '../hooks/use-onboarding-precheck';
import { useOnboardingServices } from '../hooks/use-onboarding-services';
import { usePositions } from '../hooks/use-positions';
import { useSections } from '../hooks/use-sections';
import { PhotoCropDialog } from './photo-crop-dialog';

const empty = {
    firstName: '',
    lastName: '',
    firstNameTh: '',
    lastNameTh: '',
    phone: '',
    code: '',
    departmentId: '',
    sectionId: '',
    positionId: '',
    managerId: '',
    joinedAt: '',
    services: [] as string[],
    /** Per ticked service, the detail its schema asks for: service → field key → value. */
    serviceFields: {} as Record<string, Record<string, string>>,
    onboardingNote: '',
};

const SERVICES = [
    { v: 'computer', icon: Laptop, labelKey: 'req_computer' },
    { v: 'mobile', icon: Smartphone, labelKey: 'req_mobile' },
    { v: 'email', icon: Mail, labelKey: 'req_email' },
] as const;

/** Error slot for one service field, the same path the API validates ("services.computer.device_id"). */
const serviceFieldName = (service: string, key: string) => `services.${service}.${key}`;

/** Why the day-one services cannot be requested: server code (ChainBlockReason) → lang key. */
const BLOCK_REASON_LABEL: Record<string, string> = {
    chain_approver_resigned: 'emp_onboarding_blocked_resigned',
    chain_no_manager: 'emp_onboarding_blocked_no_manager',
    workflow_inactive: 'emp_onboarding_blocked_workflow',
    workflow_incomplete: 'req_block_workflow_incomplete',
};

/** The codes that are about this person's reporting line — the ones that hold Save shut. */
const LINE_BLOCK_REASONS = ['chain_approver_resigned', 'chain_no_manager'];

/** The three steps of the wizard: icon for the stepper, heading + sub-line for the body. */
const STEPS = [
    { icon: User, titleKey: 'emp_personal_info', subKey: 'emp_personal_sub' },
    { icon: Briefcase, titleKey: 'emp_work_info', subKey: 'emp_work_sub' },
    { icon: KeyRound, titleKey: 'emp_access', subKey: 'emp_access_sub' },
] as const;

const LAST_STEP = STEPS.length;

/** Mirrors the `onboarding_note` rule in StoreEmployeeRequest. */
const NOTE_MAX = 500;

/** Which wizard step holds each form field, so a server error can open the right step. */
const STEP_OF_FIELD: Record<string, number> = {
    firstName: 1,
    lastName: 1,
    firstNameTh: 1,
    lastNameTh: 1,
    phone: 1,
    departmentId: 2,
    sectionId: 2,
    positionId: 2,
    managerId: 2,
    joinedAt: 2,
    code: 2,
};

/** Focus Dialog wizard for adding a new employee: personal info, work info, access. */
export function AddEmployeeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();
    const { employees, pickerProps: managerPickerProps } = useEmployeePicker({ match: 'position' });
    const { create } = useEmployeeMutations();
    const pushToast = useToastStore((s) => s.push);
    const stepHeadingRef = useRef<HTMLHeadingElement>(null);
    // Set by user navigation so the new step's heading takes focus
    const focusStepHeading = useRef(false);

    const [step, setStep] = useState(1);
    const [form, setForm] = useState(empty);
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Banner for a save that failed as a whole
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);

    // Can the onboarding requests be routed for this person? Asked only on the last step
    const precheck = useOnboardingPrecheck(form.managerId, form.positionId, open && step === LAST_STEP);
    // What each service asks for. Same trigger: nothing below reads it earlier.
    const { data: serviceSchemas = [] } = useOnboardingServices(open && step === LAST_STEP);
    const fieldsOf = (service: string) => serviceSchemas.find((s) => s.service === service)?.fields ?? [];
    // A definite no about the reporting line itself (in flight is not a no); only this holds Save shut
    const chainBlocked = precheck.data ? LINE_BLOCK_REASONS.includes(precheck.data.reason ?? '') : false;
    const serviceOff = (service: string) => !!precheck.data?.blocked_services.includes(service);
    const offNames = SERVICES.filter((s) => serviceOff(s.v))
        .map((s) => t(s.labelKey))
        .join(', ');
    // A failed check also holds Save shut (no one is added on an unverified line), with a retry
    const precheckFailed = precheck.isError;
    const servicesBlocked = chainBlocked || precheckFailed;
    // Nothing may be ticked before the verdict either
    const servicesLocked = servicesBlocked || precheck.isPending;
    const blockedNames = (precheck.data?.resigned_in_chain ?? []).map((e) => localName(e, lang)).join(', ');
    // Why Save is held, shared by the banner and the disabled Save button's tooltip
    const blockedReasonText = precheckFailed
        ? t('emp_onboarding_check_failed_desc')
        : chainBlocked
          ? t(BLOCK_REASON_LABEL[precheck.data?.reason ?? ''] ?? 'emp_onboarding_blocked_no_manager')
          : undefined;
    // Why some (not all) services are off while the line itself is fine — a note, not a stop.
    const offReasonText = offNames ? t(BLOCK_REASON_LABEL[precheck.data?.reason ?? ''] ?? 'emp_onboarding_blocked_workflow') : undefined;

    // Untick anything chosen before the chain turned out to be broken
    useEffect(() => {
        if (servicesBlocked) setForm((f) => (f.services.length ? { ...f, services: [] } : f));
    }, [servicesBlocked]);
    // Same for a single service whose workflow turned out to be off.
    const offKey = precheck.data?.blocked_services.join(',') ?? '';
    useEffect(() => {
        if (!offKey) return;
        const off = offKey.split(',');
        setForm((f) => (f.services.some((s) => off.includes(s)) ? { ...f, services: f.services.filter((s) => !off.includes(s)) } : f));
    }, [offKey]);

    // With no service ticked the note box is hidden, so drop its text
    useEffect(() => {
        if (form.services.length === 0) setForm((f) => (f.onboardingNote ? { ...f, onboardingNote: '' } : f));
    }, [form.services.length]);

    useEffect(() => {
        if (!open) return;
        setStep(1);
        setPhoto(null);
        setCropSrc(null);
        setPhotoError(null);
        setErrors({});
        setFormError('');
        setForm(empty);
    }, [open]);

    // Focus the new step's heading after user navigation
    useEffect(() => {
        if (focusStepHeading.current) {
            focusStepHeading.current = false;
            stepHeadingRef.current?.focus();
        }
    }, [step]);

    const isDirty = photo != null || JSON.stringify(form) !== JSON.stringify(empty);
    const guardClose = useDiscardGuard(open && isDirty);

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

    /** One field of one service. Its error key mirrors the API's own path. */
    const setServiceField = (service: string, key: string, value: string) => {
        setForm((f) => ({
            ...f,
            serviceFields: { ...f.serviceFields, [service]: { ...f.serviceFields[service], [key]: value } },
        }));
        setErrors((prev) => {
            const name = serviceFieldName(service, key);
            if (!(name in prev)) return prev;
            const next = { ...prev };
            delete next[name];
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
    const managerOption = (e: EmployeeOption): SearchOption => ({
        value: String(e.id),
        label: localName(e, lang),
        hint: e.position ?? undefined,
        avatar: e.photo_url,
        sub: e.code,
        search: '',
    });
    const managerOptions = employees.map(managerOption);
    const { data: chosenManagers = [] } = useEmployeesByIds([form.managerId ? Number(form.managerId) : null]);
    const chosenManager = chosenManagers[0] ? managerOption(chosenManagers[0]) : undefined;

    // A "special position" skips both the Department and Report-to requirements.
    const posIsSpecial = positions.find((p) => String(p.id) === form.positionId)?.allow_special_position ?? false;

    /** Validates personal info (step 1) or employment info (step 2). */
    const validateStep = (s: number) => {
        const e: Record<string, string> = {};
        if (s === 1) {
            if (!form.firstName.trim()) e.firstName = t('emp_err_first');
            if (!form.lastName.trim()) e.lastName = t('emp_err_last');
            // Optional; free-form ("ext. 1305") but must carry a number
            if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 3) e.phone = t('emp_err_phone');
        }
        if (s === 2) {
            if (!form.departmentId && !posIsSpecial) e.departmentId = t('emp_err_dept');
            if (!form.sectionId && !posIsSpecial) e.sectionId = t('emp_err_section');
            if (!form.positionId) e.positionId = t('emp_err_pos');
            if (!form.managerId && !posIsSpecial) e.managerId = t('emp_err_manager');
            if (!form.joinedAt) e.joinedAt = t('emp_err_start');
        }
        if (s === LAST_STEP) {
            // Same 500 cap as the API, caught next to the box
            if (form.onboardingNote.trim().length > NOTE_MAX) {
                e.onboardingNote = t('emp_err_note_long').replace('{n}', fmtN(NOTE_MAX));
            }
            // Ticked services must fill their fields (checked here so the message is localised)
            for (const service of form.services) {
                for (const field of fieldsOf(service)) {
                    const value = (form.serviceFields[service]?.[field.key] ?? '').trim();
                    const slot = serviceFieldName(service, field.key);

                    if (field.required && !value) {
                        e[slot] = t('emp_err_required');
                    } else if (field.input === 'email' && value && !isEmail(value)) {
                        e[slot] = t('emp_err_email');
                    }
                }
            }
        }
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    const next = () => {
        if (!validateStep(step)) return;
        focusStepHeading.current = true;
        setStep((s) => s + 1);
    };

    const back = () => {
        focusStepHeading.current = true;
        setStep((s) => s - 1);
    };

    /** Stepper click: back is always allowed, forward only through steps that validate. */
    const goToStep = (target: number) => {
        if (target === step) return;
        if (target < step) {
            focusStepHeading.current = true;
            setStep(target);
            return;
        }
        for (let s = step; s < target; s++) {
            if (!validateStep(s)) return;
        }
        focusStepHeading.current = true;
        setStep(target);
    };

    /** Localised message for a service field the API refused (its own names the raw path). */
    const serviceFieldMessage = (slot: string): string => {
        const [, service, key] = slot.split('.');
        const field = fieldsOf(service ?? '').find((f) => f.key === key);

        return field?.input === 'email' ? t('emp_err_email') : t('emp_err_invalid');
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
            // No email or username yet: both come later with the mailbox and the account
            phone: form.phone || null,
            joined_at: form.joinedAt || null,
            photo: photo ?? null,
            // Ticked services become requests filed for the new employee; a blocked chain sends none
            services: servicesBlocked ? {} : Object.fromEntries(form.services.map((s) => [s, form.serviceFields[s] ?? {}])),
            onboarding_note: form.onboardingNote.trim() || null,
        };
        try {
            const { onboarding } = await create.mutateAsync(payload);

            // The employee is saved either way; a service that could not be filed is reported with its reason
            if (onboarding?.failed.length) {
                const services = onboarding.failed.map((f) => t(SERVICES.find((s) => s.v === f.service)?.labelKey ?? f.service)).join(', ');
                // One broken chain refuses every service, so reasons are de-duplicated
                const reasons = [...new Set(onboarding.failed.map((f) => f.message))]
                    .map((message) => (BLOCK_REASON_LABEL[message] ? t(BLOCK_REASON_LABEL[message]) : message))
                    .join(', ');
                pushToast(`${services}: ${reasons}`, 'error', t('emp_onboarding_failed'));
            } else if (onboarding?.created.length) {
                // Heading on top, count on its own line below it.
                pushToast(t('emp_onboarding_filed_count').replace('{n}', fmtN(onboarding.created.length)), 'success', t('emp_onboarding_filed'));
            }
            onClose();
        } catch (err) {
            // Field errors land under their inputs, on whichever step holds the first one
            const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
            setFormError(t('emp_save_failed'));
            setFormErrorCount((n) => n + 1);
            if (!fieldErrors) return;
            const mapped: Record<string, string> = {};
            for (const [key, msgs] of Object.entries(fieldErrors)) {
                if (key === 'photo') {
                    setPhotoError(msgs[0] ?? t('emp_save_failed'));
                    continue;
                }
                // Service slots keep the API path; their server sentence names that raw path
                if (key.startsWith('services.')) {
                    mapped[key] = serviceFieldMessage(key);
                    continue;
                }
                mapped[key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] = msgs[0] ?? '';
            }
            setErrors((prev) => ({ ...prev, ...mapped }));
            const firstKey = Object.keys(mapped)[0];
            const targetStep = firstKey ? (STEP_OF_FIELD[firstKey] ?? LAST_STEP) : fieldErrors.photo ? 1 : step;
            setStep(targetStep);
            if (Object.keys(mapped).length) focusFirstError(mapped);
        }
    };

    /** Validate both sections then save. */
    const submit = async () => {
        if (create.isPending) return;
        setFormError('');
        // A blocked reporting line must be repaired first; Enter must not go around Save
        if (servicesBlocked) {
            setStep(LAST_STEP);
            return;
        }
        if (!validateStep(1)) {
            setStep(1);
            return;
        }
        if (!validateStep(2)) {
            setStep(2);
            return;
        }
        if (!validateStep(LAST_STEP)) {
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
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent
                className={focusDialogContentClass}
                onKeyDown={(e) => {
                    // Enter advances, except on controls with their own Enter handling
                    const tag = (e.target as HTMLElement).tagName;
                    if (e.key !== 'Enter' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'OPTION') return;
                    e.preventDefault();
                    if (step < LAST_STEP) next();
                    else void submit();
                }}
            >
                {/* Nested Radix dialog, always mounted so it can animate closed */}
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
                                aria-current={active ? 'step' : undefined}
                                className="focus-visible:ring-brand/40 relative flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md text-center focus-visible:ring-[3px] focus-visible:outline-hidden"
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
                        <FormErrorBanner message={formError} shakeKey={formErrorCount} />

                        <StepHead
                            ref={stepHeadingRef}
                            eyebrow={t('emp_step_n').replace('{n}', fmtN(step))}
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
                                        <label className="border-input bg-background hover:bg-accent focus-within:ring-brand/40 focus-within:border-brand inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium focus-within:ring-[3px]">
                                            <Upload className="h-4 w-4" aria-hidden />
                                            {photo ? t('emp_photo_change') : t('emp_photo')}
                                            <input
                                                name="photo"
                                                type="file"
                                                accept="image/png,image/jpeg"
                                                className="sr-only"
                                                onChange={(e) => {
                                                    onPhoto(e.target.files?.[0]);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </label>
                                        {photo && (
                                            <button
                                                type="button"
                                                onClick={() => setPhoto(null)}
                                                className="text-destructive ml-2 text-sm hover:underline"
                                            >
                                                {t('emp_photo_remove')}
                                            </button>
                                        )}
                                        {photoError ? (
                                            <p role="alert" className="text-destructive mt-2 text-xs">
                                                {photoError}
                                            </p>
                                        ) : (
                                            <p className="text-muted-foreground mt-2 text-xs">{t('emp_photo_help')}</p>
                                        )}
                                    </div>
                                </div>

                                {/* English names, Thai names, contact; autofill off (this records another person) */}
                                <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                                    <Field label={t('emp_first_name')} required name="firstName" error={errors.firstName}>
                                        <Input
                                            value={form.firstName}
                                            onChange={(e) => set('firstName', e.target.value)}
                                            placeholder={t('emp_first_name_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('emp_last_name')} required name="lastName" error={errors.lastName}>
                                        <Input
                                            value={form.lastName}
                                            onChange={(e) => set('lastName', e.target.value)}
                                            placeholder={t('emp_last_name_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('emp_first_name_th')} name="firstNameTh" error={errors.firstNameTh}>
                                        <Input
                                            value={form.firstNameTh}
                                            onChange={(e) => set('firstNameTh', e.target.value)}
                                            placeholder={t('emp_first_name_th_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('emp_last_name_th')} name="lastNameTh" error={errors.lastNameTh}>
                                        <Input
                                            value={form.lastNameTh}
                                            onChange={(e) => set('lastNameTh', e.target.value)}
                                            placeholder={t('emp_last_name_th_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    {/* No email: a new hire has no mailbox yet (Step 3 requests one) */}
                                    <Field label={t('emp_phone')} name="phone" error={errors.phone}>
                                        <Input
                                            type="tel"
                                            inputMode="tel"
                                            value={form.phone}
                                            onChange={(e) => set('phone', e.target.value)}
                                            placeholder={t('emp_phone_ph')}
                                            autoComplete="off"
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
                                        <SearchableSelect
                                            value={form.departmentId}
                                            onChange={setDepartment}
                                            placeholder={t('department_ph')}
                                            options={departments.map((d) => ({
                                                value: String(d.id),
                                                label: localName(d, lang),
                                                search: `${d.name} ${d.name_th ?? ''}`,
                                            }))}
                                        />
                                    </Field>
                                    <Field label={t('emp_section')} required={!posIsSpecial} name="sectionId" error={errors.sectionId}>
                                        <SearchableSelect
                                            value={form.sectionId}
                                            onChange={(v) => set('sectionId', v)}
                                            placeholder={t('emp_section_ph')}
                                            options={
                                                form.departmentId
                                                    ? sections.map((s) => ({
                                                          value: String(s.id),
                                                          label: localName(s, lang),
                                                          search: `${s.name} ${s.name_th ?? ''}`,
                                                      }))
                                                    : []
                                            }
                                            clearable
                                        />
                                    </Field>
                                    <Field label={t('position')} required name="positionId" error={errors.positionId}>
                                        <SearchableSelect
                                            value={form.positionId}
                                            onChange={(v) => set('positionId', v)}
                                            placeholder={t('position_ph')}
                                            options={positions.map((p) => ({
                                                value: String(p.id),
                                                label: p.title,
                                                search: `${p.title} ${p.code}`,
                                            }))}
                                        />
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
                                            placeholder={t('emp_manager_ph')}
                                            options={managerOptions}
                                            {...managerPickerProps}
                                            selectedOption={chosenManager}
                                            clearable
                                            maxRows={4}
                                        />
                                    </Field>
                                    <Field label={t('emp_start_date')} required name="joinedAt" error={errors.joinedAt}>
                                        <DateInput value={form.joinedAt} onChange={(v) => set('joinedAt', v)} />
                                    </Field>
                                    <Field label={t('emp_employee_id')} help={t('emp_id_help')} name="code" error={errors.code}>
                                        <Input
                                            value={form.code}
                                            onChange={(e) => set('code', e.target.value)}
                                            placeholder={t('emp_id_auto')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ── Step 3 · Access ────────────────────────── */}
                        {step === 3 && (
                            <>
                                {/* First on the step: it holds Save shut until the line is repaired */}
                                {servicesBlocked && (
                                    <div role="alert" className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
                                        <AlertTriangle className="text-destructive mt-0.5 !h-5 !w-5 shrink-0" />
                                        <div>
                                            <div className="text-foreground text-base font-semibold">
                                                {precheckFailed ? t('emp_onboarding_check_failed_title') : t('emp_onboarding_blocked_title')}
                                            </div>
                                            {/* Who resigned is named inside the sentence */}
                                            <div className="text-muted-foreground mt-1 text-sm">
                                                {blockedNames
                                                    ? t('emp_onboarding_blocked_resigned_named').replace('{names}', blockedNames)
                                                    : blockedReasonText}
                                            </div>
                                            {/* A failed check is retried here */}
                                            {precheckFailed && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-2.5"
                                                    onClick={() => void precheck.refetch()}
                                                    disabled={precheck.isFetching}
                                                >
                                                    {precheck.isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                                                    {t('emp_onboarding_check_retry')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3">
                                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div className="text-muted-foreground text-sm">
                                        <span className="text-foreground font-bold">{t('emp_account_pending_title')}</span> :{' '}
                                        {t('emp_account_pending_desc')}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-sm font-semibold">{t('emp_onboarding_title')}</div>
                                    <div className="text-muted-foreground mb-3 text-xs">
                                        {precheck.isPending ? t('emp_onboarding_checking') : t('emp_onboarding_sub')}
                                    </div>

                                    {!servicesBlocked && offNames && (
                                        <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3 text-sm">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                            <div className="text-muted-foreground">
                                                <span className="text-foreground font-semibold">{offNames}</span> : {offReasonText}
                                            </div>
                                        </div>
                                    )}

                                    {/* Stacked list: a ticked service grows to show its own fields */}
                                    <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                                        {SERVICES.map(({ v, icon: Icon, labelKey }) => {
                                            const on = form.services.includes(v);
                                            const fields = fieldsOf(v);
                                            const locked = servicesLocked || serviceOff(v);
                                            return (
                                                <div key={v} className={cn('transition-colors', on && 'bg-brand/5')}>
                                                    <button
                                                        type="button"
                                                        disabled={locked}
                                                        title={blockedReasonText ?? (serviceOff(v) ? offReasonText : undefined)}
                                                        aria-pressed={on}
                                                        onClick={() =>
                                                            set('services', on ? form.services.filter((x) => x !== v) : [...form.services, v])
                                                        }
                                                        className={cn(
                                                            'flex w-full items-center gap-3 p-3 text-left transition-colors',
                                                            !on && !locked && 'hover:bg-accent/50',
                                                            locked && 'cursor-not-allowed opacity-50',
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                                                                on ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            <Icon className="h-4 w-4" />
                                                        </span>
                                                        <span className="flex-1 text-sm font-medium">{t(labelKey)}</span>
                                                        <span
                                                            className={cn(
                                                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                on ? 'border-brand bg-brand text-brand-foreground' : 'border-input',
                                                            )}
                                                        >
                                                            {on && <Check className="h-3 w-3" />}
                                                        </span>
                                                    </button>

                                                    {/* Fields indented under the service they belong to */}
                                                    {on && fields.length > 0 && (
                                                        <div className="px-3 pb-3 pl-14">
                                                            <div className="border-brand/30 space-y-3 border-l pl-4">
                                                                {fields.map((field) => (
                                                                    <ServiceField
                                                                        key={field.key}
                                                                        service={v}
                                                                        field={field}
                                                                        lang={lang}
                                                                        value={form.serviceFields[v]?.[field.key] ?? ''}
                                                                        error={errors[serviceFieldName(v, field.key)]}
                                                                        onChange={(value) => setServiceField(v, field.key, value)}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Appended to each filed request's reason (EmployeeOnboardingService::reason()) */}
                                {form.services.length > 0 && (
                                    <Field label={t('emp_onboarding_note')} name="onboardingNote" error={errors.onboardingNote}>
                                        <Textarea
                                            value={form.onboardingNote}
                                            onChange={(e) => set('onboardingNote', e.target.value)}
                                            placeholder={t('emp_onboarding_note_ph')}
                                            className="min-h-[96px]"
                                        />
                                    </Field>
                                )}

                                {/* What Save will do; hidden when the banner says it won't */}
                                {!servicesBlocked && <p className="text-muted-foreground text-xs">{t('emp_onboarding_deferred')}</p>}
                            </>
                        )}
                    </div>
                </div>

                {/* Footer — Cancel/Back · step dots · Next/Save */}
                <DialogFooterBar className="justify-start">
                    <Button variant="outline" onClick={step === 1 ? () => guardClose(onClose) : back} disabled={create.isPending}>
                        {step === 1 ? (
                            t('cancel')
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" />
                                {t('back')}
                            </>
                        )}
                    </Button>

                    <div className="mx-auto flex gap-1.5" aria-hidden>
                        {STEPS.map((s, i) => (
                            <span
                                key={s.titleKey}
                                className={cn(
                                    'h-1.5 rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none',
                                    i + 1 === step ? 'bg-brand w-5' : 'bg-border w-1.5',
                                )}
                            />
                        ))}
                    </div>

                    {step < LAST_STEP ? (
                        <Button onClick={next}>
                            {t('next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        // Held shut while the reporting line cannot carry the onboarding requests
                        <Button onClick={submit} disabled={create.isPending || servicesBlocked} title={blockedReasonText}>
                            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {create.isPending ? t('saving') : t('save')}
                        </Button>
                    )}
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );
}

/** One field a day-one service asks for, rendered from the Request module's schema. */
function ServiceField({
    service,
    field,
    lang,
    value,
    error,
    onChange,
}: {
    service: string;
    field: OnboardingServiceField;
    lang: 'th' | 'en';
    value: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    const label = localLabel(field, lang);

    return (
        <Field label={label} required={field.required} name={serviceFieldName(service, field.key)} error={error}>
            {field.input === 'select' ? (
                <SearchableSelect
                    value={value}
                    onChange={onChange}
                    options={(field.options ?? []).map((option) => ({
                        value: option.value,
                        label: localLabel(option, lang),
                        search: `${option.label_en} ${option.label_th}`,
                    }))}
                />
            ) : (
                <Input
                    type={field.input === 'email' ? 'email' : 'text'}
                    inputMode={field.input === 'email' ? 'email' : undefined}
                    autoCapitalize={field.input === 'email' ? 'none' : undefined}
                    spellCheck={field.input === 'email' ? false : undefined}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                />
            )}
        </Field>
    );
}

/** Per-step heading: small step number, bold title, muted subtitle. Focusable for step changes. */
const StepHead = forwardRef<HTMLHeadingElement, { eyebrow: string; title: string; sub: string }>(({ eyebrow, title, sub }, ref) => (
    <div>
        <p className="text-brand text-xs font-bold tracking-wide uppercase">{eyebrow}</p>
        <h2 ref={ref} tabIndex={-1} className="mt-1 text-xl font-extrabold tracking-tight outline-none">
            {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{sub}</p>
    </div>
));
StepHead.displayName = 'StepHead';
