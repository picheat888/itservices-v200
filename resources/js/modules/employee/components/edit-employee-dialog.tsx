import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { StatusBadge } from '@/shared/components/status-badge';
import { UserAvatar } from '@/shared/components/user-avatar';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, ArrowRight, Briefcase, Check, Loader2, SquarePen, Upload, User, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDepartments } from '../hooks/use-departments';
import { useEmployeeMutations, useEmployeeOptions } from '../hooks/use-employees';
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
};

/** Centered "focus dialog" for editing an existing employee's profile and org assignment. */
export function EditEmployeeDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee | null }) {
    const fmt = useDateFormat();
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();
    const { data: employees = [] } = useEmployeeOptions();
    const { update } = useEmployeeMutations();

    const [form, setForm] = useState(empty);
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Banner for a save that failed as a whole
    const [formError, setFormError] = useState('');
    const [formErrorCount, setFormErrorCount] = useState(0);
    // Set when the server rejects the chosen manager because it would form a reporting-tree loop.
    const [managerLoop, setManagerLoop] = useState(false);
    // Set when org fields (position/dept/manager) changed — shows inline confirm panel before saving.
    const [orgConfirm, setOrgConfirm] = useState(false);
    // Brief success state after a save — shows "✓ Saved" before the dialog closes.
    const [saved, setSaved] = useState(false);
    const orgHeadingRef = useRef<HTMLDivElement>(null);
    const saveButtonRef = useRef<HTMLButtonElement>(null);

    // Retain the last employee so the header chip and status survive the close animation
    const [shown, setShown] = useState(employee);
    useEffect(() => {
        if (employee) setShown(employee);
    }, [employee]);

    // The org-confirm panel replaces the focused Save button, so focus moves to its heading
    useEffect(() => {
        if (orgConfirm) orgHeadingRef.current?.focus();
    }, [orgConfirm]);

    useEffect(() => {
        if (!open) {
            setManagerLoop(false);
            setOrgConfirm(false);
            return;
        }
        setPhoto(null);
        setCropSrc(null);
        setPhotoError(null);
        setErrors({});
        setFormError('');
        setManagerLoop(false);
        setOrgConfirm(false);
        setSaved(false);
        if (employee) {
            setForm({
                firstName: employee.first_name ?? '',
                lastName: employee.last_name ?? '',
                firstNameTh: employee.first_name_th ?? '',
                lastNameTh: employee.last_name_th ?? '',
                email: employee.email ?? '',
                phone: employee.phone ?? '',
                code: employee.code ?? '',
                departmentId: employee.department_id ? String(employee.department_id) : '',
                sectionId: employee.section_id ? String(employee.section_id) : '',
                positionId: employee.position_id ? String(employee.position_id) : '',
                managerId: employee.manager_id ? String(employee.manager_id) : '',
                joinedAt: employee.joined_at ?? '',
            });
        } else {
            setForm(empty);
        }
        // Keyed on employee?.id so incidental re-renders keep transient state
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, employee?.id]);

    const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : (employee?.photo_url ?? null)), [photo, employee]);
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

    // Manager candidates: everyone except the employee being edited.
    const managerOptions = useMemo(
        () =>
            employees
                .filter((e) => e.id !== employee?.id)
                .map((e) => ({
                    value: String(e.id),
                    label: lang === 'th' ? (e.name_th ?? e.name) : e.name,
                    hint: e.position ?? undefined,
                    avatar: e.photo_url,
                    sub: e.code,
                    search: `${e.name} ${e.name_th ?? ''} ${e.code} ${e.position ?? ''}`,
                })),
        [employees, employee, lang],
    );

    /** Human label for a position id, or "(none)" when unset. */
    const positionLabel = (id: string) => positions.find((p) => String(p.id) === id)?.title ?? t('emp_org_change_none');
    /** Human label for a department id (language-aware), or "(none)" when unset. */
    const departmentLabel = (id: string) => {
        const d = departments.find((x) => String(x.id) === id);
        return d ? (lang === 'th' ? (d.name_th ?? d.name) : d.name) : t('emp_org_change_none');
    };
    /** Human label for a manager id (employee name), or "(none)" when unset. */
    const managerLabel = (id: string) => {
        const m = employees.find((e) => String(e.id) === id);
        return m ? (lang === 'th' ? (m.name_th ?? m.name) : m.name) : t('emp_org_change_none');
    };

    // Org assignment as it stood when the dialog opened, used to diff against the form.
    const origPositionId = employee?.position_id ? String(employee.position_id) : '';
    const origDepartmentId = employee?.department_id ? String(employee.department_id) : '';
    const origManagerId = employee?.manager_id ? String(employee.manager_id) : '';

    // The position/department/manager moves to confirm — computed each render.
    const orgChanges = employee
        ? [
              origPositionId !== form.positionId && {
                  label: t('emp_org_change_position'),
                  from: positionLabel(origPositionId),
                  to: positionLabel(form.positionId),
              },
              origDepartmentId !== form.departmentId && {
                  label: t('emp_org_change_department'),
                  from: departmentLabel(origDepartmentId),
                  to: departmentLabel(form.departmentId),
              },
              origManagerId !== form.managerId && {
                  label: t('emp_org_change_manager'),
                  from: managerLabel(origManagerId),
                  to: managerLabel(form.managerId),
              },
          ].filter(Boolean as unknown as <T>(x: T | false) => x is T)
        : [];

    // Snapshot as opened (same key order as the init effect) for the dirty check
    const initialForm = useMemo(
        () =>
            employee
                ? {
                      firstName: employee.first_name ?? '',
                      lastName: employee.last_name ?? '',
                      firstNameTh: employee.first_name_th ?? '',
                      lastNameTh: employee.last_name_th ?? '',
                      email: employee.email ?? '',
                      phone: employee.phone ?? '',
                      code: employee.code ?? '',
                      departmentId: employee.department_id ? String(employee.department_id) : '',
                      sectionId: employee.section_id ? String(employee.section_id) : '',
                      positionId: employee.position_id ? String(employee.position_id) : '',
                      managerId: employee.manager_id ? String(employee.manager_id) : '',
                      joinedAt: employee.joined_at ?? '',
                  }
                : empty,
        [employee],
    );
    // Dirty when any field differs from the snapshot, or a new photo was picked.
    const isDirty = useMemo(() => photo != null || JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm, photo]);
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    // A "special position" skips both the Department and Report-to requirements.
    const posIsSpecial = positions.find((p) => String(p.id) === form.positionId)?.allow_special_position ?? false;

    /** Validates every field in one pass; both columns are on screen together. */
    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.firstName.trim()) e.firstName = t('emp_err_first');
        if (!form.lastName.trim()) e.lastName = t('emp_err_last');
        // ASCII-only practical pattern — rejects unicode (สมชาย@…), double @, and spaces up front.
        if (form.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(form.email)) e.email = t('emp_err_email');
        // Optional; free-form ("ext. 1305") but must carry a number
        if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 3) e.phone = t('emp_err_phone');
        if (!form.departmentId && !posIsSpecial) e.departmentId = t('emp_err_dept');
        if (!form.sectionId && !posIsSpecial) e.sectionId = t('emp_err_section');
        if (!form.positionId) e.positionId = t('emp_err_pos');
        if (!form.managerId && !posIsSpecial) e.managerId = t('emp_err_manager');
        if (!form.joinedAt) e.joinedAt = t('emp_err_start');
        else if (employee?.last_day && form.joinedAt >= employee.last_day)
            e.joinedAt = t('emp_err_start_after_last_day').replace('{date}', fmt.date(employee.last_day));
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    /**
     * Save gate. If org fields changed, pause and show the inline confirm panel;
     * otherwise commit the update immediately.
     */
    const submit = async () => {
        if (update.isPending || saved) return;
        setFormError('');
        if (!validate()) return;
        if (orgChanges.length > 0) {
            setOrgConfirm(true);
            return;
        }
        if (
            employee &&
            isDirty &&
            !(await confirmEdit({ name: lang === 'th' ? (employee.name_th ?? employee.name) : employee.name, sub: employee.code }))
        )
            return;
        await persist();
    };

    /** Builds the payload and commits the update mutation. */
    const persist = async () => {
        if (!employee) return;
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
            phone: form.phone || null,
            joined_at: form.joinedAt || null,
            photo: photo ?? null,
        };
        try {
            await update.mutateAsync({ id: employee.id, payload });
            setOrgConfirm(false);
            // Show "✓ Saved" briefly, then close.
            setSaved(true);
            window.setTimeout(onClose, 1200);
        } catch (err) {
            // manager_id = reporting-tree loop; other field errors land under their inputs
            const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
            setOrgConfirm(false);
            if (fieldErrors?.manager_id) {
                setManagerLoop(true);
                focusFirstError({ managerId: t('emp_manager_loop_title') });
                return;
            }
            setFormError(t('emp_save_failed'));
            setFormErrorCount((n) => n + 1);
            if (fieldErrors) {
                const mapped: Record<string, string> = {};
                for (const [key, msgs] of Object.entries(fieldErrors)) {
                    if (key === 'photo') {
                        setPhotoError(msgs[0] ?? t('emp_save_failed'));
                        continue;
                    }
                    mapped[key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] = msgs[0] ?? '';
                }
                setErrors((prev) => ({ ...prev, ...mapped }));
                focusFirstError(mapped);
            }
        }
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

    const status = shown?.status;

    // ── Shared field blocks ──────────────────────────────────────────────────

    const photoBlock = (
        <div className="flex items-center gap-4">
            <UserAvatar
                name={`${form.firstName} ${form.lastName}`}
                photoUrl={photoUrl}
                className="h-16 w-16"
                textClassName="text-lg"
                fallbackIcon={<User className="h-6 w-6" />}
            />
            <div className="min-w-0">
                <label className="border-input bg-background hover:bg-accent focus-within:ring-brand/40 focus-within:border-brand inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium focus-within:ring-[3px]">
                    <Upload className="h-4 w-4" aria-hidden />
                    {/* "Change" whenever a photo is on screen */}
                    {photoUrl ? t('emp_photo_change') : t('emp_photo')}
                    <input
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
                    <button type="button" onClick={() => setPhoto(null)} className="text-destructive ml-2 text-sm hover:underline">
                        {t('cancel')}
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
    );

    // Autofill off everywhere: this form records another person, not the operator
    const nameFields = (
        <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
            </div>
        </>
    );

    const contactFields = (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Field label={t('emp_email')} name="email" error={errors.email}>
                <Input
                    type="email"
                    inputMode="email"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder={t('emp_email_ph')}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                />
            </Field>
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
    );

    const departmentField = (
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
    );

    const sectionField = (
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
    );

    const positionField = (
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
    );

    const managerField = (
        <Field label={t('emp_manager')} help={t('emp_manager_help')} required={!posIsSpecial} name="managerId" error={errors.managerId}>
            <SearchableSelect
                value={form.managerId}
                onChange={(v) => set('managerId', v)}
                placeholder={t('emp_manager_ph')}
                options={managerOptions}
                clearable
                maxRows={4}
            />
        </Field>
    );

    const joinedField = (
        <Field label={t('emp_start_date')} required name="joinedAt" error={errors.joinedAt}>
            <DateInput value={form.joinedAt} onChange={(v) => set('joinedAt', v)} />
        </Field>
    );

    const codeField = (
        <Field label={t('emp_employee_id')} help={t('emp_id_help')} name="code" error={errors.code}>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder={t('emp_id_auto')} autoComplete="off" />
        </Field>
    );

    // Always mounted (imageSrc toggles) so the crop dialog can animate closed.
    const cropDialog = (
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
    );

    return (
        <>
            <Dialog
                open={open}
                onOpenChange={(o) => {
                    if (!o) {
                        guardClose(() => {
                            setOrgConfirm(false);
                            onClose();
                        });
                    }
                }}
            >
                <DialogContent
                    className="!flex max-h-[calc(100dvh-4.5rem)] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
                    onKeyDown={(e) => {
                        // Enter submits, except on controls with their own Enter handling
                        const tag = (e.target as HTMLElement).tagName;
                        if (e.key !== 'Enter' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'OPTION') return;
                        e.preventDefault();
                        void submit();
                    }}
                >
                    {/* Nested Radix dialog: portals out and becomes the active layer */}
                    {cropDialog}

                    <FocusDialogHeader
                        icon={SquarePen}
                        eyebrow={t('emp_v_edit_title')}
                        title={`${form.firstName} ${form.lastName}`.trim() || (shown?.name ?? '')}
                        code={shown?.code}
                        srDescription={t('edit_employee')}
                        headerRight={
                            status && (
                                <StatusBadge tone={status === 'resigned' ? 'red' : 'green'} className="shrink-0">
                                    {status === 'resigned' ? t('resigned') : t('active')}
                                </StatusBadge>
                            )
                        }
                    />

                    {/* Org-change confirm panel (inline, not a stacked dialog) */}
                    {orgConfirm && (
                        <>
                            <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-t px-6 py-5">
                                <div className="flex items-start gap-3.5">
                                    <span className="bg-brand/15 text-brand grid h-10 w-10 shrink-0 place-items-center rounded-lg">
                                        <Briefcase className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                                        <div ref={orgHeadingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
                                            {t('emp_org_change_title')}
                                        </div>
                                        <div className="text-muted-foreground text-sm leading-relaxed">{t('emp_org_change_desc')}</div>
                                    </div>
                                </div>
                                <div className="space-y-2.5">
                                    {orgChanges.map((c) => (
                                        <div key={c.label} className="border-border rounded-lg border p-3">
                                            <div className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
                                                {c.label}
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-muted-foreground min-w-0 flex-1 truncate line-through">{c.from}</span>
                                                <ArrowRight className="text-brand h-4 w-4 shrink-0" />
                                                <span className="text-foreground min-w-0 flex-1 truncate font-medium">{c.to}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="border-border bg-muted/20 flex items-center justify-end gap-2 border-t px-6 py-3.5">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setOrgConfirm(false);
                                        window.setTimeout(() => saveButtonRef.current?.focus(), 0);
                                    }}
                                    disabled={update.isPending}
                                >
                                    {t('cancel')}
                                </Button>
                                <Button onClick={persist} disabled={update.isPending}>
                                    {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    {update.isPending ? t('saving') : t('emp_org_confirm')}
                                </Button>
                            </div>
                        </>
                    )}

                    {!orgConfirm && (
                        <>
                            {/* Two columns: left = who the person is, right = where they sit in the org. */}
                            <div className="grid flex-1 grid-cols-1 content-start gap-x-10 gap-y-6 overflow-y-auto border-t px-6 py-6 sm:grid-cols-2">
                                <FormErrorBanner message={formError} shakeKey={formErrorCount} className="sm:col-span-2" />

                                {/* Manager-loop alert (inline, not a stacked dialog) */}
                                {managerLoop && (
                                    <div
                                        role="alert"
                                        className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-800 sm:col-span-2 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                                    >
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div className="flex-1">
                                            <div className="text-sm font-semibold">{t('emp_manager_loop_title')}</div>
                                            <div className="mt-0.5 text-xs leading-relaxed">{t('emp_manager_loop_body')}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setManagerLoop(false)}
                                            aria-label={t('emp_understood')}
                                            className="-mr-1 grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-amber-100 dark:hover:bg-amber-900/40"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                )}

                                {/* LEFT: personal info */}
                                <section>
                                    <SectionLabel>{t('emp_personal_info')}</SectionLabel>
                                    <div className="flex flex-col gap-3.5">
                                        {photoBlock}
                                        {/* The code is the person's identifier, so it opens the block. */}
                                        {codeField}
                                        {nameFields}
                                        {contactFields}
                                    </div>
                                </section>

                                {/* RIGHT: employment */}
                                <section>
                                    <SectionLabel>{t('emp_v_employment')}</SectionLabel>
                                    <div className="flex flex-col gap-3.5">
                                        {departmentField}
                                        {sectionField}
                                        {positionField}
                                        {managerField}
                                        {joinedField}
                                    </div>
                                </section>
                            </div>

                            {/* ── Footer ── */}
                            <div className="border-border bg-muted/20 flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5">
                                <Button variant="outline" onClick={() => guardClose(onClose)}>
                                    {t('cancel')}
                                </Button>
                                <Button ref={saveButtonRef} onClick={submit} disabled={update.isPending || saved || !isDirty}>
                                    {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
                                    {update.isPending ? t('saving') : saved ? t('saved') : t('save')}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
