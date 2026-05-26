import { Field } from '@/components/shared/field';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PhotoCropDialog } from './photo-crop-dialog';
import { useDepartments, useEmployeeMutations, usePositions } from '@/hooks/use-org';
import { useSettings } from '@/hooks/use-settings';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Employee } from '@/types';
import { ArrowLeft, ArrowRight, Briefcase, Calendar, Check, Info, KeyRound, Laptop, Mail, Smartphone, Upload, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function splitName(full: string | null | undefined): [string, string] {
    const parts = (full ?? '').trim().split(' ');
    return [parts[0] ?? '', parts.slice(1).join(' ')];
}

const empty = {
    firstName: '',
    lastName: '',
    firstNameTh: '',
    lastNameTh: '',
    email: '',
    phone: '',
    code: '',
    departmentId: '',
    positionId: '',
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

export function AddEmployeeDrawer({ open, onClose, employee }: { open: boolean; onClose: () => void; employee?: Employee | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();
    const { create, update } = useEmployeeMutations();
    const { data: settings } = useSettings();
    const isEdit = !!employee;
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(empty);
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
        if (employee) {
            const [fn, ln] = splitName(employee.name);
            const [fnTh, lnTh] = splitName(employee.name_th);
            setForm({
                firstName: fn,
                lastName: ln,
                firstNameTh: fnTh,
                lastNameTh: lnTh,
                email: employee.email ?? '',
                phone: employee.phone ?? '',
                code: employee.code ?? '',
                departmentId: employee.department_id ? String(employee.department_id) : '',
                positionId: employee.position_id ? String(employee.position_id) : '',
                joinedAt: employee.joined_at ?? '',
                services: [],
                onboardingNote: '',
            });
        } else {
            setForm(empty);
        }
    }, [open, employee]);

    const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : employee?.photo_url ?? null), [photo, employee]);
    useEffect(() => () => { if (photo && photoUrl) URL.revokeObjectURL(photoUrl); }, [photo, photoUrl]);

    const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }));

    const validateStep = (s: number) => {
        const e: Record<string, string> = {};
        if (s === 1) {
            if (!form.firstName.trim()) e.firstName = t('emp_err_first');
            if (!form.lastName.trim()) e.lastName = t('emp_err_last');
            if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = t('emp_err_email');
        }
        if (s === 2) {
            if (!form.departmentId) e.departmentId = t('emp_err_dept');
            if (!form.positionId) e.positionId = t('emp_err_pos');
            if (!form.joinedAt) e.joinedAt = t('emp_err_start');
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const next = () => validateStep(step) && setStep((s) => s + 1);

    const submit = async () => {
        if (!validateStep(1) || !validateStep(2)) return;
        const nameTh = `${form.firstNameTh} ${form.lastNameTh}`.trim();
        const payload = {
            name: `${form.firstName} ${form.lastName}`.trim(),
            code: form.code.trim() || undefined,
            name_th: nameTh || null,
            department_id: form.departmentId ? Number(form.departmentId) : null,
            position_id: form.positionId ? Number(form.positionId) : null,
            email: form.email || null,
            username: null,
            phone: form.phone || null,
            joined_at: form.joinedAt || null,
            photo: photo ?? null,
        };
        if (employee) await update.mutateAsync({ id: employee.id, payload });
        else await create.mutateAsync(payload);
        onClose();
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
        // Open crop dialog — user frames the 1:1 shot before committing.
        setCropSrc(URL.createObjectURL(file));
    };

    const steps = [t('emp_personal_info'), t('emp_work_info'), t('emp_access')];
    const photoInitials = `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase();

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[600px] flex-col sm:max-w-[600px]">
                {cropSrc && (
                    <PhotoCropDialog
                        imageSrc={cropSrc}
                        onConfirm={(cropped) => {
                            setPhoto(cropped);
                            URL.revokeObjectURL(cropSrc);
                            setCropSrc(null);
                        }}
                        onCancel={() => {
                            URL.revokeObjectURL(cropSrc);
                            setCropSrc(null);
                        }}
                    />
                )}
                <SheetHeader>
                    <SheetTitle>{isEdit ? t('edit_employee') : t('add_employee')}</SheetTitle>
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
                                // Going back — always allowed, no validation needed.
                                setStep(n);
                            } else {
                                // Going forward — validate every step up to n-1 first.
                                let valid = true;
                                for (let s = step; s < n; s++) {
                                    if (!validateStep(s)) { valid = false; break; }
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
                                    active ? 'border-brand bg-brand/5' : done ? 'border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10' : 'border-border hover:bg-accent/50',
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
                                <div className={cn('mt-0.5 text-xs font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>{label}</div>
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
                        step < 3 ? next() : submit();
                    }}
                >
                    {step === 1 && (
                        <>
                            <div className="flex items-center gap-4">
                                <Avatar className="h-16 w-16">
                                    {photoUrl && <AvatarImage src={photoUrl} alt="" />}
                                    <AvatarFallback className="bg-brand/10 text-brand">
                                        {photoInitials || <User className="h-6 w-6" />}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent">
                                        <Upload className="h-4 w-4" />
                                        {photo ? t('emp_photo_change') : t('emp_photo')}
                                        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                                    </label>
                                    {photo && (
                                        <button onClick={() => setPhoto(null)} className="ml-2 text-sm text-destructive hover:underline">
                                            {t('emp_photo_remove')}
                                        </button>
                                    )}
                                    {photoError
                                        ? <p className="mt-2 text-xs text-destructive">{photoError}</p>
                                        : <p className="mt-2 text-xs text-muted-foreground">{t('emp_photo_help')}</p>
                                    }
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('emp_first_name')} required error={errors.firstName}>
                                    <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} placeholder="John" />
                                </Field>
                                <Field label={t('emp_last_name')} required error={errors.lastName}>
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
                            <Field label={t('emp_email')} error={errors.email}>
                                <Input className="font-mono" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="john.doe@example.com" />
                            </Field>
                            <Field label={t('emp_phone')}>
                                <Input className="font-mono" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+1 202 555 0100" />
                            </Field>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Field label={t('department')} required error={errors.departmentId}>
                                <Select value={form.departmentId} onValueChange={(v) => set('departmentId', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="—" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {departments.map((d) => (
                                            <SelectItem key={d.id} value={String(d.id)}>
                                                {lang === 'th' ? d.name_th ?? d.name : d.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field label={t('position')} required error={errors.positionId}>
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
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('emp_start_date')} required error={errors.joinedAt}>
                                    <div className="relative">
                                        <Input
                                            className="font-mono pr-9 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                            type="date"
                                            value={form.joinedAt}
                                            onChange={(e) => set('joinedAt', e.target.value)}
                                        />
                                        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    </div>
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
                            <div className="flex items-start gap-2.5 rounded-lg bg-brand/5 p-3">
                                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                                <div>
                                    <div className="text-sm font-medium text-foreground">
                                        {t('emp_default_role_title')}: {settings?.default_employee_role_label ?? 'Employee'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{t('emp_default_role_notice')}</div>
                                </div>
                            </div>

                            {!isEdit && (
                                <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/10 p-3">
                                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div>
                                        <div className="text-sm font-medium text-foreground">{t('emp_account_pending_title')}</div>
                                        <div className="mt-0.5 text-xs text-muted-foreground">{t('emp_account_pending_desc')}</div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div className="text-sm font-semibold">{t('emp_onboarding_title')}</div>
                                <div className="mb-3 text-xs text-muted-foreground">{t('emp_onboarding_sub')}</div>
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
                                                <span className={cn('flex h-8 w-8 items-center justify-center rounded-md', on ? 'bg-brand text-white' : 'bg-muted text-muted-foreground')}>
                                                    <Icon className="h-4 w-4" />
                                                </span>
                                                <span className="flex-1 text-sm font-medium">{t(labelKey)}</span>
                                                <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-input')}>
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

                            <p className="text-xs text-muted-foreground">{t('emp_onboarding_deferred')}</p>
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
                        <Button onClick={submit} disabled={create.isPending || update.isPending}>
                            <Check className="h-4 w-4" />
                            {t('save')}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
