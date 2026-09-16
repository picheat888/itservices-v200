import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, focusFirstError, isEmail } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, focusDialogContentClass } from '@/shared/ui/dialog';
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
import { useEffect, useMemo, useState } from 'react';
import type { OnboardingServiceField } from '../api/employeeApi';
import { useDepartments } from '../hooks/use-departments';
import { useEmployeeMutations, useEmployees } from '../hooks/use-employees';
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

/**
 * Error slot for one service field, matching the path the API validates
 * ("services.computer.device_id") so a 422 lands under the control that caused it
 * without a translation table in between.
 */
const serviceFieldName = (service: string, key: string) => `services.${service}.${key}`;

/**
 * Why the day-one services cannot be requested, code → the line that says so. The
 * server always sends a code and never a sentence (see ChainBlockReason, plus
 * `workflow_inactive` from the precheck), so both the Step 3 banner and the toast
 * after Save read it in the viewer's language. Anything unrecognised falls back to
 * whatever text the server sent.
 */
const BLOCK_REASON_LABEL: Record<string, string> = {
    chain_approver_resigned: 'emp_onboarding_blocked_resigned',
    chain_no_manager: 'emp_onboarding_blocked_no_manager',
    workflow_inactive: 'emp_onboarding_blocked_workflow',
};

/** The three steps of the wizard: icon for the stepper, heading + sub-line for the body. */
const STEPS = [
    { icon: User, titleKey: 'emp_personal_info', subKey: 'emp_personal_sub' },
    { icon: Briefcase, titleKey: 'emp_work_info', subKey: 'emp_work_sub' },
    { icon: KeyRound, titleKey: 'emp_access', subKey: 'emp_access_sub' },
] as const;

const LAST_STEP = STEPS.length;

/** Mirrors the `onboarding_note` rule in StoreEmployeeRequest. */
const NOTE_MAX = 500;

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
    const pushToast = useToastStore((s) => s.push);

    const [step, setStep] = useState(1);
    const [form, setForm] = useState(empty);
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Can these requests be routed for this person at all? Asked only while the step
    // that offers them is on screen; the answer depends on the Step 2 reporting line.
    const precheck = useOnboardingPrecheck(form.managerId, form.positionId, open && step === LAST_STEP);
    // What each service asks for. Same trigger: nothing below reads it earlier.
    const { data: serviceSchemas = [] } = useOnboardingServices(open && step === LAST_STEP);
    const fieldsOf = (service: string) => serviceSchemas.find((s) => s.service === service)?.fields ?? [];
    // A definite no. Undefined while the answer is still in flight, which is NOT a no.
    const chainBlocked = precheck.data ? !precheck.data.can_request : false;
    // "Cannot answer" is not a no either, but it is just as much not a yes — and the
    // rule here is that nobody is added on a reporting line we have not verified. So an
    // endpoint that fails holds Save shut too, visibly, with a way to ask again; failing
    // open would quietly restore the old behaviour and nobody would know the rule lapsed.
    const precheckFailed = precheck.isError;
    const servicesBlocked = chainBlocked || precheckFailed;
    // Nothing may be ticked before the verdict either, so the cards never flick from
    // enabled to disabled under the pointer.
    const servicesLocked = servicesBlocked || precheck.isPending;
    const blockedNames = (precheck.data?.resigned_in_chain ?? []).map((e) => (lang === 'th' ? (e.name_th ?? e.name) : e.name)).join(', ');
    // The one line that says why, shared by the banner and the tooltip on the disabled
    // Save button — a control nobody can press still owes an explanation on hover.
    const blockedReasonText = precheckFailed
        ? t('emp_onboarding_check_failed_desc')
        : chainBlocked
          ? t(BLOCK_REASON_LABEL[precheck.data?.reason ?? ''] ?? 'emp_onboarding_blocked_no_manager')
          : undefined;

    // Drop anything ticked before the chain turned out to be broken — the payload
    // guard below is the authority, this is so the cards do not sit lit and dead.
    useEffect(() => {
        if (servicesBlocked) setForm((f) => (f.services.length ? { ...f, services: [] } : f));
    }, [servicesBlocked]);

    // The note belongs to the services; with none ticked its box is not on screen, so a
    // note typed and then abandoned would be sent from a field nobody could see or fix.
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
        if (s === LAST_STEP) {
            // The API caps this at 500; catching it here shows the count next to the box
            // instead of a toast after the whole form has been sent.
            if (form.onboardingNote.trim().length > NOTE_MAX) {
                e.onboardingNote = t('emp_err_note_long').replace('{n}', String(NOTE_MAX));
            }
            // A ticked service has to say what it is asking for. The API refuses the same
            // thing, but its message names the raw path ("services.email.address") in
            // English — so the checks it can also make are made here, in the reader's
            // language and next to the control.
            for (const service of form.services) {
                for (const field of fieldsOf(service)) {
                    const value = (form.serviceFields[service]?.[field.key] ?? '').trim();
                    const slot = serviceFieldName(service, field.key);

                    if (field.required && !value) {
                        e[slot] = t('emp_err_required');
                    } else if (field.input === 'email' && value && !isEmail(value)) {
                        // Same wording the employee's own email field uses.
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

    /**
     * What to say when the API refuses a service field. Its own message is an English
     * sentence built around the raw path, so the wording comes from this module's keys
     * instead — the same ones the client-side checks use, so a field reads the same
     * whichever side caught it.
     */
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
            // No email: a new hire has none yet — it stays null until the mailbox is created.
            // The username is not sent at all: it is written when the account is provisioned.
            phone: form.phone || null,
            joined_at: form.joinedAt || null,
            photo: photo ?? null,
            // Ticked services are filed as service requests on the new employee's
            // behalf, once the record exists, each carrying the detail Step 3 collected
            // for it. A chain that cannot carry them sends none, however the form got
            // into that state.
            services: servicesBlocked ? {} : Object.fromEntries(form.services.map((s) => [s, form.serviceFields[s] ?? {}])),
            onboarding_note: form.onboardingNote.trim() || null,
        };
        try {
            const { onboarding } = await create.mutateAsync(payload);

            // The employee is saved either way, so a service that could not be filed
            // has to be said out loud rather than silently dropped — and with the
            // reason, since "computer failed" and "the manager resigned" send the
            // reader to two different people.
            if (onboarding?.failed.length) {
                const services = onboarding.failed.map((f) => t(SERVICES.find((s) => s.v === f.service)?.labelKey ?? f.service)).join(', ');
                // One broken chain refuses every service, so the same reason would
                // otherwise be repeated once per line.
                const reasons = [...new Set(onboarding.failed.map((f) => f.message))]
                    .map((message) => (BLOCK_REASON_LABEL[message] ? t(BLOCK_REASON_LABEL[message]) : message))
                    .join(' · ');
                // Somebody has to file these by hand, so it waits to be dismissed.
                pushToast(`${services} - ${reasons}`, 'error', t('emp_onboarding_failed'));
            } else if (onboarding?.created.length) {
                // Heading on top, count on its own line below it.
                pushToast(t('emp_onboarding_filed_count').replace('{n}', String(onboarding.created.length)), 'success', t('emp_onboarding_filed'));
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
                    if (key.startsWith('services.')) {
                        // The slot already IS the API path (see serviceFieldName), so it
                        // must not be camel-cased the way a top-level column is. The
                        // server's own sentence is dropped: it names the raw path in
                        // English ("The services.email.address field must be…"), which is
                        // not something to put in front of the person filling this form.
                        mapped[key] = serviceFieldMessage(key);
                        continue;
                    }
                    mapped[key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] = msgs[0] ?? '';
                }
                setErrors((prev) => ({ ...prev, ...mapped }));
                focusFirstError(mapped);
                // Whatever is shown under the control is what the toast repeats.
                pushToast(Object.values(mapped)[0] ?? t('emp_save_failed'), 'error');
            } else {
                throw err;
            }
        }
    };

    /** Validate both sections then save. */
    const submit = async () => {
        // A reporting line that cannot carry this person's onboarding requests has to
        // be repaired first — the Save button says so, and Enter must not go around it.
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
        // The service detail lives on this step, so it is checked last and needs no jump.
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

                                {/* Row-wise: English names, then Thai names, then contact.
                                    Every field turns autofill off: this form records ANOTHER person,
                                    so the browser's saved name/email/phone are never the right answer.
                                    Left unset, Chrome guesses from the labels and drops the operator's
                                    own details into several boxes at once — the surname and the email
                                    were arriving filled with the same saved value. */}
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
                                    <Field label={t('emp_first_name_th')}>
                                        <Input
                                            value={form.firstNameTh}
                                            onChange={(e) => set('firstNameTh', e.target.value)}
                                            placeholder={t('emp_first_name_th_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('emp_last_name_th')}>
                                        <Input
                                            value={form.lastNameTh}
                                            onChange={(e) => set('lastNameTh', e.target.value)}
                                            placeholder={t('emp_last_name_th_ph')}
                                            autoComplete="off"
                                        />
                                    </Field>
                                    {/* No email here: a new hire has no company mailbox yet — asking
                                        for one is asking for something that does not exist. Step 3
                                        requests the mailbox instead, and the address lands on the
                                        record once it has been created. Edit still has the field, for
                                        an employee who does have one by then. */}
                                    <Field label={t('emp_phone')} name="phone" error={errors.phone}>
                                        <Input
                                            className="font-mono"
                                            value={form.phone}
                                            onChange={(e) => set('phone', e.target.value)}
                                            placeholder="+66 81 234 5678 / ext. 1305"
                                            inputMode="tel"
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
                                    {/* SearchableSelect for all four pickers on this step, matching the
                                        Edit dialog: department and position were plain Selects, so two of
                                        the four could not be typed into and looked different from their
                                        neighbours for no reason a user could see. */}
                                    <Field label={t('department')} required={!posIsSpecial} name="departmentId" error={errors.departmentId}>
                                        <SearchableSelect
                                            value={form.departmentId}
                                            onChange={setDepartment}
                                            placeholder={t('department_ph')}
                                            options={departments.map((d) => ({
                                                value: String(d.id),
                                                label: lang === 'th' ? (d.name_th ?? d.name) : d.name,
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
                                                          label: lang === 'th' ? (s.name_th ?? s.name) : s.name,
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
                                            clearable
                                        />
                                    </Field>
                                    <Field label={t('emp_start_date')} required name="joinedAt" error={errors.joinedAt}>
                                        <DateInput value={form.joinedAt} onChange={(v) => set('joinedAt', v)} />
                                    </Field>
                                    <Field label={t('emp_employee_id')} help={t('emp_id_help')}>
                                        {/* The code itself is mono; the placeholder is a Thai sentence and
                                            JetBrains Mono carries no Thai glyphs, so it would fall back to
                                            whatever the browser picks. Only font-sans names a Thai face. */}
                                        <Input
                                            className="font-mono placeholder:font-sans"
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
                                {/* First thing on the step, because it no longer only refuses the
                                    services below — it holds Save shut until the line is repaired. */}
                                {servicesBlocked && (
                                    <div className="border-destructive/30 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
                                        <AlertTriangle className="text-destructive mt-0.5 !h-5 !w-5 shrink-0" />
                                        <div>
                                            <div className="text-foreground text-base font-semibold">
                                                {precheckFailed ? t('emp_onboarding_check_failed_title') : t('emp_onboarding_blocked_title')}
                                            </div>
                                            {/* Who resigned belongs inside the sentence, not on a line of its
                                                own: the name IS the reason, and a third row only made the
                                                reader assemble it themselves. */}
                                            <div className="text-muted-foreground mt-1 text-sm">
                                                {blockedNames
                                                    ? t('emp_onboarding_blocked_resigned_named').replace('{names}', blockedNames)
                                                    : blockedReasonText}
                                            </div>
                                            {/* A chain that answered "no" is fixed elsewhere — the reason line
                                                already says so. A check that could not answer is retried right
                                                here rather than by reopening the wizard. */}
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

                                {/* The default role used to sit beside this. It moved to the Set
                                    Credentials dialog, where the role is actually decided and where a
                                    missing default group actually stops the work — repeating it here
                                    only asked HR to read something they cannot act on. */}
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

                                    {/* A list, not the three-across row this used to be: each service
                                        now carries the detail it asks for, and grid rows equalise their
                                        height — ticking one would have stretched all three. Stacked, only
                                        the ticked one grows, and its fields sit inside its own row where
                                        they visibly belong to it. This is also what the narrow layout
                                        always showed, so the two widths now agree. */}
                                    <div className="border-border divide-border divide-y overflow-hidden rounded-lg border">
                                        {SERVICES.map(({ v, icon: Icon, labelKey }) => {
                                            const on = form.services.includes(v);
                                            const fields = fieldsOf(v);
                                            return (
                                                <div key={v} className={cn('transition-colors', on && 'bg-brand/5')}>
                                                    <button
                                                        type="button"
                                                        disabled={servicesLocked}
                                                        title={blockedReasonText}
                                                        aria-pressed={on}
                                                        onClick={() =>
                                                            set('services', on ? form.services.filter((x) => x !== v) : [...form.services, v])
                                                        }
                                                        className={cn(
                                                            'flex w-full items-center gap-3 p-3 text-left transition-colors',
                                                            !on && !servicesLocked && 'hover:bg-accent/50',
                                                            servicesLocked && 'cursor-not-allowed opacity-50',
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                                                                on ? 'bg-brand text-white' : 'bg-muted text-muted-foreground',
                                                            )}
                                                        >
                                                            <Icon className="h-4 w-4" />
                                                        </span>
                                                        <span className="flex-1 text-sm font-medium">{t(labelKey)}</span>
                                                        <span
                                                            className={cn(
                                                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                on ? 'border-brand bg-brand text-white' : 'border-input',
                                                            )}
                                                        >
                                                            {on && <Check className="h-3 w-3" />}
                                                        </span>
                                                    </button>

                                                    {/* Indented to sit under the icon and hung off a rule, so the
                                                        fields read as part of the service above rather than as the
                                                        next thing on the page. */}
                                                    {on && fields.length > 0 && (
                                                        <div className="animate-in fade-in-0 slide-in-from-top-1 px-3 pb-3 pl-14 duration-200 motion-reduce:animate-none">
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

                                {/* Appended to each filed request's reason, behind `**` on its own
                                    line — see EmployeeOnboardingService::reason(). A textarea because
                                    that is what it feeds: the Request form's own reason field, which
                                    is a textarea there. */}
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

                                {/* Describes what Save will do — silent when the banner has just
                                    said it will not happen. */}
                                {!servicesBlocked && <p className="text-muted-foreground text-xs">{t('emp_onboarding_deferred')}</p>}
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
                        // Held shut while the reporting line cannot carry this person's
                        // onboarding requests: the record and the requests go out together
                        // or not at all, so the line gets fixed before anyone is added.
                        <Button onClick={submit} disabled={create.isPending || servicesBlocked} title={blockedReasonText}>
                            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {create.isPending ? t('saving') : t('save')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/**
 * One field a day-one service asks for, rendered from the Request module's schema rather
 * than from anything hardcoded here — a `select` becomes the same SearchableSelect the
 * rest of the wizard uses, anything else a text input of the matching kind.
 *
 * Labels come from the schema too, so a device type IT renames under Settings → Request
 * data reads the same here as it does on the request itself.
 */
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
    const label = lang === 'th' ? field.label_th || field.label_en : field.label_en;

    return (
        <Field label={label} required={field.required} name={serviceFieldName(service, field.key)} error={error}>
            {field.input === 'select' ? (
                <SearchableSelect
                    value={value}
                    onChange={onChange}
                    /* No placeholder: the label is right above it, and repeating it inside the
                       control said nothing twice. Falls back to the shared "Select…". */
                    options={(field.options ?? []).map((option) => ({
                        value: option.value,
                        label: lang === 'th' ? option.label_th || option.label_en : option.label_en,
                        search: `${option.label_en} ${option.label_th}`,
                    }))}
                />
            ) : (
                <Input
                    type={field.input === 'email' ? 'email' : 'text'}
                    className={cn(field.mono && 'font-mono')}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                />
            )}
        </Field>
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
