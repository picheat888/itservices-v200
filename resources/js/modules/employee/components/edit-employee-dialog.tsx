import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SectionLabel } from '@/shared/components/section-label';
import { UserAvatar } from '@/shared/components/user-avatar';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { AlertTriangle, ArrowRight, Briefcase, Check, Loader2, SquarePen, Upload, User, X } from 'lucide-react';
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
};

/** Centered "focus dialog" for editing an existing employee's profile and org assignment. */
export function EditEmployeeDialog({ open, onClose, employee }: { open: boolean; onClose: () => void; employee: Employee | null }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { data: departments = [] } = useDepartments();
    const { data: positions = [] } = usePositions();
    const { data: employees = [] } = useEmployees();
    const { update } = useEmployeeMutations();
    const pushToast = useToastStore((s) => s.push);

    const [form, setForm] = useState(empty);
    const { data: sections = [] } = useSections(form.departmentId ? Number(form.departmentId) : null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Set when the server rejects the chosen manager because it would form a reporting-tree loop.
    const [managerLoop, setManagerLoop] = useState(false);
    // Set when org fields (position/dept/manager) changed — shows inline confirm panel before saving.
    const [orgConfirm, setOrgConfirm] = useState(false);
    // Brief success state after a save — shows "✓ Saved" before the dialog closes.
    const [saved, setSaved] = useState(false);

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
        // Depend on employee?.id (stable), NOT the employee object — avoids wiping transient
        // state (manager-loop warning) on incidental re-renders with the same employee id.
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

    // Snapshot of the form as the dialog opened — same shape/key-order as the init effect,
    // so JSON compare against `form` is exact. Save stays disabled until something truly changes.
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

    // A "special position" skips both the Department and Report-to requirements.
    const posIsSpecial = positions.find((p) => String(p.id) === form.positionId)?.allow_special_position ?? false;

    /**
     * Validates every field in one pass. Both columns are on screen together, so all the
     * problems are flagged at once instead of surfacing one section at a time.
     */
    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.firstName.trim()) e.firstName = t('emp_err_first');
        if (!form.lastName.trim()) e.lastName = t('emp_err_last');
        // ASCII-only practical pattern — rejects unicode (สมชาย@…), double @, and spaces up front.
        if (form.email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(form.email)) e.email = t('emp_err_email');
        // Optional, but once filled it has to be a number — free-form so "ext. 1305" is allowed,
        // matching a ticket's callback phone.
        if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 3) e.phone = t('emp_err_phone');
        if (!form.departmentId && !posIsSpecial) e.departmentId = t('emp_err_dept');
        if (!form.sectionId && !posIsSpecial) e.sectionId = t('emp_err_section');
        if (!form.positionId) e.positionId = t('emp_err_pos');
        if (!form.managerId && !posIsSpecial) e.managerId = t('emp_err_manager');
        if (!form.joinedAt) e.joinedAt = t('emp_err_start');
        setErrors(e);
        if (Object.keys(e).length) focusFirstError(e);
        return Object.keys(e).length === 0;
    };

    /**
     * Save gate. If org fields changed, pause and show the inline confirm panel;
     * otherwise commit the update immediately.
     */
    const submit = async () => {
        if (!validate()) return;
        if (orgChanges.length > 0) {
            setOrgConfirm(true);
            return;
        }
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
            // 422 manager_id = reporting-tree loop: close confirm panel, show inline warning.
            // Other field errors map onto the form's camelCase error slots so they render
            // under the matching inputs; the toast stays as a catch-all signal.
            const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
            if (fieldErrors?.manager_id) {
                setOrgConfirm(false);
                setManagerLoop(true);
            } else if (fieldErrors) {
                const mapped: Record<string, string> = {};
                for (const [key, msgs] of Object.entries(fieldErrors)) {
                    mapped[key.replace(/_(\w)/g, (_m, c: string) => c.toUpperCase())] = msgs[0] ?? '';
                }
                setErrors((prev) => ({ ...prev, ...mapped }));
                pushToast(Object.values(fieldErrors)[0]?.[0] ?? t('emp_save_failed'), 'error');
            } else {
                throw err;
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

    const status = employee?.status;

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
                <label className="border-input bg-background hover:bg-accent inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
                    <Upload className="h-4 w-4" />
                    {/* Keyed off the rendered photo, not the pending pick — an employee who already
                        has one is changing it, not adding it. */}
                    {photoUrl ? t('emp_photo_change') : t('emp_photo')}
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
                </label>
                {photo && (
                    <button type="button" onClick={() => setPhoto(null)} className="text-destructive ml-2 text-sm hover:underline">
                        {t('cancel')}
                    </button>
                )}
                {photoError ? (
                    <p className="text-destructive mt-2 text-xs">{photoError}</p>
                ) : (
                    <p className="text-muted-foreground mt-2 text-xs">{t('emp_photo_help')}</p>
                )}
            </div>
        </div>
    );

    /*
     * Every field turns autofill off: this form records ANOTHER person, so the browser's
     * saved name/email/phone are never the right answer. Left unset, Chrome guesses from
     * the labels and drops the operator's own details into several boxes at once.
     */
    const nameFields = (
        <>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
        </>
    );

    const contactFields = (
        <div className="grid grid-cols-2 gap-3">
            <Field label={t('emp_email')} name="email" error={errors.email}>
                <Input
                    className="font-mono"
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="john.doe@example.com"
                    autoComplete="off"
                />
            </Field>
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
            />
        </Field>
    );

    const joinedField = (
        <Field label={t('emp_start_date')} required name="joinedAt" error={errors.joinedAt}>
            <DateInput value={form.joinedAt} onChange={(v) => set('joinedAt', v)} />
        </Field>
    );

    const codeField = (
        <Field label={t('emp_employee_id')} help={t('emp_id_help')}>
            {/* The code itself is mono; the placeholder is a Thai sentence and JetBrains Mono
                carries no Thai glyphs, so it would fall back to whatever the browser picks.
                Only font-sans names a Thai face. */}
            <Input
                className="font-mono placeholder:font-sans"
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder={t('emp_id_auto')}
                autoComplete="off"
            />
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
                        setOrgConfirm(false);
                        onClose();
                    }
                }}
            >
                <DialogContent
                    className="!flex max-h-[calc(100vh-4.5rem)] w-[calc(100vw-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
                    onKeyDown={(e) => {
                        // Skip Enter-to-submit when focus is on an interactive element that
                        // has its own click/change handler (button, select, option).
                        const tag = (e.target as HTMLElement).tagName;
                        if (e.key !== 'Enter' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'OPTION') return;
                        e.preventDefault();
                        void submit();
                    }}
                >
                    {/* PhotoCropDialog is its own (nested) Radix dialog, so it portals itself out
                        and becomes the active layer — placement here is fine, not inerted. */}
                    {cropDialog}

                    <FocusDialogHeader
                        // The tile states what this dialog does; the photo itself lives in the
                        // form below, where it can actually be changed.
                        icon={SquarePen}
                        eyebrow={t('emp_v_edit_title')}
                        title={`${form.firstName} ${form.lastName}`.trim() || (employee?.name ?? '')}
                        code={employee?.code}
                        srDescription={t('edit_employee')}
                        headerRight={
                            <span
                                className={cn(
                                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                                    status === 'resigned'
                                        ? 'bg-destructive/15 text-destructive'
                                        : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                                )}
                            >
                                {status === 'resigned' ? t('resigned') : t('active')}
                            </span>
                        }
                    />

                    {/* ── Org-change confirm panel (inline — avoids Radix focus-trap fighting a stacked Dialog) ── */}
                    {orgConfirm && (
                        <>
                            <div className="flex flex-1 flex-col gap-4 overflow-y-auto border-t px-6 py-5">
                                <div className="flex items-start gap-3.5">
                                    <span className="bg-brand/15 text-brand grid h-10 w-10 shrink-0 place-items-center rounded-lg">
                                        <Briefcase className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                                        <div className="text-lg font-semibold">{t('emp_org_change_title')}</div>
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
                                <Button variant="outline" onClick={() => setOrgConfirm(false)} disabled={update.isPending}>
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
                                {/* Manager-loop alert — inline (NOT a stacked modal: Radix focus-trap fights it) */}
                                {managerLoop && (
                                    <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-800 sm:col-span-2 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
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
                                <Button variant="outline" onClick={onClose}>
                                    {t('cancel')}
                                </Button>
                                <Button onClick={submit} disabled={update.isPending || saved || !isDirty}>
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
