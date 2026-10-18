import { useT } from '@/lang';
import { PhotoCropDialog, useDepartments, useEmployeePicker, useEmployeesByIds } from '@/modules/employee';
import { useBrands } from '@/modules/settings';
import { ColorSwatchPicker } from '@/shared/components/color-swatch-picker';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect, type SearchOption } from '@/shared/components/searchable-select';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useFormError } from '@/shared/hooks/use-form-error';
import { refusalReason, serverMessage } from '@/shared/lib/api-errors';
import { localName } from '@/shared/lib/local-name';
import { formatNumber } from '@/shared/lib/number';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { AccessKind, EmailGroup, EmployeeOption, FileShare, SocialPlatform, Software, SoftwareLicenseType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Folder, Globe, Package, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccessMutations } from '../hooks/use-access';
import { LogoPicker } from './logo-picker';
import { isFreeLicense, LICENSE_CARDS, LicenseTypePicker, ProductKeySection, SeatsField } from './software-form-sections';

/** Attach a non-passive wheel listener to a text input so hovering + scrolling nudges the value by ±1 (min 0). */
function useWheelStep(onStep: (delta: 1 | -1) => void) {
    const [el, setEl] = useState<HTMLInputElement | null>(null);
    useEffect(() => {
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            onStep(e.deltaY < 0 ? 1 : -1);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [el, onStep]);
    return setEl;
}

type AnyResource = EmailGroup | FileShare | SocialPlatform | Software;

/** Storage size units offered on the file share "Size" field. */
type SizeUnit = 'KB' | 'GB' | 'TB' | 'PB';
const SIZE_UNITS: SizeUnit[] = ['KB', 'GB', 'TB', 'PB'];

/** Format a raw "1234.5" size value with thousands separators on the integer part. */
function formatSizeValue(raw: string): string {
    if (!raw) return '';
    const [intPart, decPart] = raw.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

/** Per-kind icon tile accent for the dialog header (matches the registry tables). */
const HEAD: Record<AccessKind, { icon: LucideIcon; color: string }> = {
    'email-groups': { icon: Users, color: '#7c3aed' },
    'file-shares': { icon: Folder, color: '#0d9488' },
    'social-platforms': { icon: Globe, color: '#6366f1' },
    software: { icon: Package, color: '#f59e0b' },
};

// The full form state covers every field across the four kinds; only the
// fields relevant to the active kind are rendered and submitted.
type FormState = {
    name: string;
    email: string;
    description: string;
    path: string;
    size_value: string;
    size_unit: SizeUnit;
    url: string;
    color: string;
    policy: string;
    owner_employee_id: string;
    department_id: string;
    brand_id: string;
    license_type: SoftwareLicenseType;
    seats: string;
    seats_unlimited: boolean;
    product_key: string;
    notes: string;
};

const empty: FormState = {
    name: '',
    email: '',
    description: '',
    path: '',
    size_value: '',
    size_unit: 'GB',
    url: '',
    color: '',
    policy: '',
    owner_employee_id: '',
    department_id: '',
    brand_id: '',
    license_type: 'subscription',
    seats: '',
    seats_unlimited: false,
    product_key: '',
    notes: '',
};

/** Hydrate the form from an existing row (edit) or reset to blank (create). */
function fromRow(kind: AccessKind, row: AnyResource | null): FormState {
    if (!row) return empty;
    if (kind === 'email-groups') {
        const r = row as EmailGroup;
        // Owner is managed in the members drawer (setOwner), not on this form.
        return {
            ...empty,
            name: r.name,
            email: r.email,
            description: r.description ?? '',
            department_id: r.department_id ? String(r.department_id) : '',
        };
    }
    if (kind === 'file-shares') {
        const r = row as FileShare;
        // Owner is managed in the members drawer (setOwner), not on this form.
        return {
            ...empty,
            name: r.name,
            path: r.path,
            // Split columns: size 0 = unlimited; a blank value means unspecified.
            size_value: r.size != null ? String(r.size) : '',
            size_unit: (r.size_unit as SizeUnit) || 'GB',
            description: r.description ?? '',
            department_id: r.department_id ? String(r.department_id) : '',
        };
    }
    if (kind === 'software') {
        const r = row as Software;
        return {
            ...empty,
            name: r.name,
            brand_id: r.brand_id ? String(r.brand_id) : '',
            license_type: r.license_type,
            seats: r.seats != null ? String(r.seats) : '',
            seats_unlimited: r.seats == null,
            product_key: r.product_key ?? '',
            notes: r.notes ?? '',
        };
    }
    const r = row as SocialPlatform;
    return { ...empty, name: r.name, url: r.url ?? '', color: r.color ?? '', policy: r.policy ?? '' };
}

/** Build the API payload for the active kind from the form state. */
function toPayload(kind: AccessKind, form: FormState): Record<string, unknown> {
    if (kind === 'email-groups') {
        return {
            name: form.name.trim(),
            email: form.email.trim(),
            description: form.description.trim() || null,
            department_id: form.department_id ? Number(form.department_id) : null,
        };
    }
    if (kind === 'file-shares') {
        return {
            name: form.name.trim(),
            path: form.path.trim(),
            // Split size + unit for reporting. A value of 0 = unlimited (no unit sent).
            size: form.size_value.trim() ? parseInt(form.size_value.replace(/,/g, ''), 10) : 0,
            size_unit: parseInt(form.size_value.replace(/,/g, ''), 10) > 0 ? form.size_unit : null,
            description: form.description.trim() || null,
            department_id: form.department_id ? Number(form.department_id) : null,
        };
    }
    if (kind === 'software') {
        // product_key + logo + remove_logo are appended in submit() (they depend on the
        // key switch and the logo File, which live outside FormState).
        return {
            name: form.name.trim(),
            brand_id: form.brand_id ? Number(form.brand_id) : null,
            license_type: form.license_type,
            seats: form.seats_unlimited ? null : Number(form.seats),
            seats_unlimited: form.seats_unlimited,
            notes: form.notes.trim() || null,
        };
    }
    return {
        name: form.name.trim(),
        url: form.url.trim() || null,
        color: form.color.trim() || null,
        policy: form.policy.trim() || null,
    };
}

/**
 * Create/edit dialog for an access resource. Renders different fields per kind
 * (email group / file share / social platform / software) and persists via
 * useAccessMutations.
 */
export function ResourceModal({ open, kind, row, onClose }: { open: boolean; kind: AccessKind; row: AnyResource | null; onClose: () => void }) {
    const t = useT();
    const confirmEdit = useConfirmEdit();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useAccessMutations(kind);
    const { employees, pickerProps } = useEmployeePicker();
    const { data: departments = [] } = useDepartments();
    const { data: brands = [] } = useBrands();
    const [form, setForm] = useState<FormState>(empty);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const formError = useFormError();
    const clearFormError = formError.clear;
    // Software logo (upload/crop/remove) + product-key controls live outside FormState.
    const [logo, setLogo] = useState<File | null>(null);
    const [removeLogo, setRemoveLogo] = useState(false);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [storeKey, setStoreKey] = useState(false);
    // Employee's department resolved to its short tag (abbreviation) for the option chip.
    const deptTag = useMemo(() => new Map(departments.map((d) => [d.id, d.tag])), [departments]);

    // On edit, Save stays disabled until something actually changes — compare the live
    // form (plus the software-only logo / key controls that live outside FormState)
    // against the values the dialog was hydrated with. Create always allows submit.
    const initialForm = useMemo(() => fromRow(kind, row), [kind, row]);
    const initialStoreKey = useMemo(() => {
        const sw = kind === 'software' ? (row as Software | null) : null;
        const licence = sw?.license_type ?? 'subscription';
        return sw ? !!sw.product_key : (LICENSE_CARDS.find((c) => c.value === licence)?.expectsKey ?? false);
    }, [kind, row]);
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm) || logo !== null || removeLogo || storeKey !== initialStoreKey;
    const guardClose = useDiscardGuard(open && isDirty);

    useEffect(() => {
        if (open) {
            setForm(fromRow(kind, row));
            setErrors({});
            clearFormError();
            setLogo(null);
            setRemoveLogo(false);
            setCropSrc(null);
            setLogoError(null);
            // Key switch: on when a key is already stored, else follow the licence's default.
            const sw = kind === 'software' ? (row as Software | null) : null;
            const licence = sw?.license_type ?? 'subscription';
            setStoreKey(sw ? !!sw.product_key : (LICENSE_CARDS.find((c) => c.value === licence)?.expectsKey ?? false));
        }
    }, [open, kind, row, clearFormError]);

    // Kinds that carry an uploadable logo (software licences + social platforms).
    const hasLogo = kind === 'software' || kind === 'social-platforms';
    // Live preview: a freshly cropped file wins; otherwise the saved logo (unless removed).
    const logoPreview = useMemo(() => {
        if (logo) return URL.createObjectURL(logo);
        if (!removeLogo && row && hasLogo) return (row as Software | SocialPlatform).logo_url ?? null;
        return null;
    }, [logo, removeLogo, row, hasLogo]);
    useEffect(() => {
        return () => {
            if (logo && logoPreview) URL.revokeObjectURL(logoPreview);
        };
    }, [logo, logoPreview]);

    /** Validate a picked logo file, then open the crop dialog. */
    const onLogo = (file?: File) => {
        setLogoError(null);
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            setLogoError(t('access_logo_err_type'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setLogoError(t('access_logo_err_size'));
            return;
        }
        setCropSrc(URL.createObjectURL(file));
    };

    // Freeze the shown kind/row while the dialog animates closed, so the header and the
    // field set don't flip to the default (email-group create) mid-exit — that flip reads
    // as a collapse instead of a clean fade-out.
    const [shownKind, setShownKind] = useState(kind);
    const [shownRow, setShownRow] = useState<AnyResource | null>(row);
    useEffect(() => {
        if (open) {
            setShownKind(kind);
            setShownRow(row);
        }
    }, [open, kind, row]);
    const curKind = open ? kind : shownKind;
    const curRow = open ? row : shownRow;

    // Update a field and clear its error as soon as the user starts correcting it.
    const set = (k: keyof FormState, v: string) => {
        setForm((f) => ({ ...f, [k]: v }));
        setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
    };

    const setUnlimitedSeats = (unlimited: boolean) => {
        setForm((f) => ({ ...f, seats_unlimited: unlimited }));
        setErrors((e) => (e.seats ? { ...e, seats: undefined } : e));
    };

    // Free / open source → unlimited, key off unless one is on file; back to paid counts seats again.
    const pickLicense = (type: SoftwareLicenseType) => {
        const free = isFreeLicense(type);
        const wasFree = isFreeLicense(form.license_type);
        setForm((f) => ({ ...f, license_type: type, seats_unlimited: free ? true : wasFree ? false : f.seats_unlimited }));
        setStoreKey(free ? !!form.product_key.trim() : true);
        if (free) setErrors((e) => (e.seats ? { ...e, seats: undefined } : e));
    };

    // Hovering the Size input + scrolling nudges the value by ±1 instead of the browser's spinner arrows.
    const sizeInputRef = useWheelStep((delta) => {
        setForm((f) => ({ ...f, size_value: String(Math.max(0, (parseFloat(f.size_value) || 0) + delta)) }));
    });

    const employeeOption = (e: EmployeeOption): SearchOption => ({
        value: String(e.id),
        label: localName(e, lang),
        sub: e.code,
        tag: e.department_id != null ? (deptTag.get(e.department_id) ?? undefined) : undefined,
        search: '',
    });
    const employeeOptions = employees.map(employeeOption);
    const { data: chosenOwners = [] } = useEmployeesByIds([form.owner_employee_id ? Number(form.owner_employee_id) : null]);
    const chosenOwner = chosenOwners[0] ? employeeOption(chosenOwners[0]) : undefined;
    const departmentOptions = useMemo(
        () =>
            departments.map((d) => ({
                value: String(d.id),
                label: localName(d, lang),
                sub: d.tag,
                search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
            })),
        [departments, lang],
    );
    const brandOptions = useMemo(() => brands.map((b) => ({ value: String(b.id), label: b.name, search: b.name })), [brands]);
    // Licences already granted; an edited seat count may not go below this.
    const seatsInUse = curKind === 'software' && curRow ? ((curRow as Software).seats_used ?? 0) : 0;
    const seatsBelowUseMsg = t('access_err_seats_below_used').replaceAll('{n}', String(seatsInUse));

    // Basic email shape check for instant feedback (backend re-validates with the full rule).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /** Client-side required/format checks; returns per-field messages (empty = valid). */
    const validate = (): Partial<Record<keyof FormState, string>> => {
        const e: Partial<Record<keyof FormState, string>> = {};
        if (!form.name.trim()) e.name = t('access_err_required');
        if (curKind === 'email-groups') {
            if (!form.email.trim()) e.email = t('access_err_required');
            else if (!EMAIL_RE.test(form.email.trim())) e.email = t('access_err_email');
            if (!form.department_id) e.department_id = t('access_err_required');
            // A new email group must also pick an owner (the workflow approver).
            if (!curRow && !form.owner_employee_id) e.owner_employee_id = t('access_err_required');
        }
        if (curKind === 'file-shares') {
            if (!form.path.trim()) e.path = t('access_err_required');
            if (!form.department_id) e.department_id = t('access_err_required');
            if (!form.size_value.trim()) e.size_value = t('access_err_required');
            // A new file share must also pick an owner (matches email groups).
            if (!curRow && !form.owner_employee_id) e.owner_employee_id = t('access_err_required');
        }
        if (curKind === 'software' && !form.seats_unlimited) {
            if (!form.seats.trim()) e.seats = t('access_err_seats_required');
            else if (Number(form.seats) < 1) e.seats = t('access_err_seats_min');
            else if (form.seats !== initialForm.seats && Number(form.seats) < seatsInUse) e.seats = seatsBelowUseMsg;
        }
        return e;
    };

    const submit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length) {
            focusFirstError(errs as Record<string, string>);
            return;
        }
        if (row && isDirty && !(await confirmEdit({ name: row.name, sub: row.code }))) return;
        const payload = toPayload(kind, form);
        // Owner is set at creation only; on edit it's managed via the members dialog.
        if (!row && (kind === 'email-groups' || kind === 'file-shares')) {
            payload.owner_employee_id = form.owner_employee_id ? Number(form.owner_employee_id) : null;
        }
        if (kind === 'software') {
            // Key off → send empty so the backend clears it.
            payload.product_key = storeKey ? form.product_key.trim() : '';
        }
        // Logo (software + social platforms): a File makes the request multipart.
        if (hasLogo) {
            if (logo) payload.logo = logo;
            if (removeLogo) payload.remove_logo = true;
        }
        formError.clear();
        try {
            if (row) await update.mutateAsync({ id: row.id, payload });
            else await create.mutateAsync(payload);
        } catch (err) {
            // Surface Laravel 422 field errors on the form instead of failing silently.
            const fieldErrors = (err as { response?: { data?: { errors?: Record<string, string[]> } } })?.response?.data?.errors;
            if (fieldErrors) {
                const mapped: Partial<Record<keyof FormState, string>> = {};
                for (const [k, msgs] of Object.entries(fieldErrors)) {
                    const key = k as keyof FormState;
                    if (key === 'email' && /taken/i.test(msgs[0] ?? '')) mapped[key] = t('access_err_email_taken');
                    else if (key === 'seats' && msgs[0] === 'seats_below_in_use')
                        mapped[key] = t('access_err_seats_below_used').replaceAll('{n}', String(refusalReason(err)?.body.in_use ?? seatsInUse));
                    else mapped[key] = msgs[0] ?? t('access_err_required');
                }
                setErrors(mapped);
                focusFirstError(mapped as Record<string, string>);
                return;
            }
            formError.show(serverMessage(err) ?? t('cd_error'));
            return;
        }
        useToastStore.getState().push(t('saved'), 'success');
        onClose();
    };

    const titleByKind: Record<AccessKind, string> = {
        'email-groups': t('access_email_groups'),
        'file-shares': t('access_file_shares'),
        'social-platforms': t('access_social'),
        software: t('access_software'),
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent
                className={cn('gap-0 p-0', curKind === 'software' ? 'sm:max-w-[600px]' : 'sm:max-w-[540px]')}
                // Start on the first text field (the name), not the logo picker that sits before it.
                onOpenAutoFocus={(e) => {
                    const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('input:not([type=file]):not([type=color])');
                    if (first) {
                        e.preventDefault();
                        first.focus();
                    }
                }}
            >
                <FocusDialogHeader
                    icon={HEAD[curKind].icon}
                    accent={HEAD[curKind].color}
                    round
                    eyebrow={titleByKind[curKind]}
                    title={curKind === 'software' ? t(curRow ? 'access_edit_software' : 'access_add_software') : curRow ? t('edit') : t('access_add')}
                    code={curRow?.code ?? undefined}
                    srDescription={titleByKind[curKind]}
                />

                <div
                    className={cn('max-h-[calc(100dvh-10rem)] overflow-y-auto px-6', curKind === 'software' ? 'space-y-3.5 py-4' : 'space-y-4 py-5')}
                >
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    {/* Software and Social lead with their logo beside the name instead of the shared Name. */}
                    {(curKind === 'email-groups' || curKind === 'file-shares') && (
                        <Field label={t('access_name')} required name="name" error={errors.name}>
                            <Input
                                name="resource_name"
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder={curKind === 'email-groups' ? t('access_ph_group_name') : t('access_ph_share_name')}
                                autoFocus
                                autoComplete="off"
                            />
                        </Field>
                    )}

                    {curKind === 'email-groups' && (
                        <>
                            <Field label={t('access_email')} required name="email" error={errors.email}>
                                <Input
                                    value={form.email}
                                    onChange={(e) => set('email', e.target.value)}
                                    placeholder={t('access_ph_email')}
                                    autoComplete="off"
                                    inputMode="email"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                />
                            </Field>
                            <Field label={t('access_department')} required name="department_id" error={errors.department_id}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} />
                            </Field>
                            {!curRow && (
                                <Field label={t('access_owner_approver')} required name="owner_employee_id" error={errors.owner_employee_id}>
                                    <SearchableSelect
                                        value={form.owner_employee_id}
                                        onChange={(v) => set('owner_employee_id', v)}
                                        options={employeeOptions}
                                        {...pickerProps}
                                        selectedOption={chosenOwner}
                                        placeholder={t('access_pick_employee')}
                                    />
                                </Field>
                            )}
                            <Field label={t('access_description')}>
                                <Input value={form.description} onChange={(e) => set('description', e.target.value)} autoComplete="off" />
                            </Field>
                        </>
                    )}

                    {curKind === 'file-shares' && (
                        <>
                            <Field label={t('access_path')} required name="path" error={errors.path}>
                                <Input
                                    value={form.path}
                                    onChange={(e) => set('path', e.target.value)}
                                    placeholder={t('access_ph_path')}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                />
                            </Field>
                            <Field label={t('access_department')} required name="department_id" error={errors.department_id}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} />
                            </Field>
                            <Field
                                label={t('access_size')}
                                required
                                name="size_value"
                                error={errors.size_value}
                                help={t('access_size_unlimited_hint')}
                            >
                                <div
                                    className={cn(
                                        'border-input bg-background hover:border-brand/50 focus-within:border-brand focus-within:ring-brand/15 flex h-10 w-full overflow-hidden rounded-md border transition-colors focus-within:ring-[3px]',
                                        errors.size_value && 'border-destructive',
                                    )}
                                >
                                    <input
                                        name="size_value"
                                        ref={sizeInputRef}
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={formatSizeValue(form.size_value)}
                                        onChange={(e) => set('size_value', e.target.value.replace(/,/g, '').replace(/[^\d.]/g, ''))}
                                        placeholder={t('access_ph_size')}
                                        aria-label={t('access_size')}
                                        aria-invalid={!!errors.size_value}
                                        title={t('access_size_wheel_hint')}
                                        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-2 text-right text-sm outline-hidden"
                                    />
                                    {/* When 0 (unlimited) the unit is meaningless — show the label instead of the picker. */}
                                    {parseFloat(form.size_value) === 0 ? (
                                        <span className="bg-muted/40 border-input text-muted-foreground grid w-24 shrink-0 place-items-center border-l px-3 text-sm font-medium">
                                            {t('access_size_unlimited')}
                                        </span>
                                    ) : (
                                        <Select value={form.size_unit} onValueChange={(v) => set('size_unit', v as SizeUnit)}>
                                            <SelectTrigger
                                                aria-label={t('access_size_unit')}
                                                className="border-input bg-muted/40 h-full w-24 shrink-0 justify-center gap-1 rounded-none border-0 border-l px-3 text-sm focus:ring-0 focus:ring-offset-0"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="min-w-0">
                                                {SIZE_UNITS.map((u) => (
                                                    <SelectItem key={u} value={u}>
                                                        {u}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                            </Field>
                            {!curRow && (
                                <Field label={t('access_owner')} required name="owner_employee_id" error={errors.owner_employee_id}>
                                    <SearchableSelect
                                        value={form.owner_employee_id}
                                        onChange={(v) => set('owner_employee_id', v)}
                                        options={employeeOptions}
                                        {...pickerProps}
                                        selectedOption={chosenOwner}
                                        placeholder={t('access_pick_employee')}
                                    />
                                </Field>
                            )}
                            <Field label={t('access_description')}>
                                <Input value={form.description} onChange={(e) => set('description', e.target.value)} autoComplete="off" />
                            </Field>
                        </>
                    )}

                    {curKind === 'social-platforms' && (
                        <>
                            {/* Identity — logo beside name + URL (same layout as Software) */}
                            <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-5">
                                <LogoPicker
                                    preview={logoPreview}
                                    icon={Globe}
                                    tone="indigo"
                                    onPick={onLogo}
                                    onRemove={() => {
                                        setLogo(null);
                                        setRemoveLogo(true);
                                    }}
                                />
                                <div className="min-w-0 space-y-3">
                                    <Field label={t('access_name')} required name="name" error={errors.name}>
                                        <Input
                                            value={form.name}
                                            onChange={(e) => set('name', e.target.value)}
                                            placeholder={t('access_ph_platform_name')}
                                            autoFocus
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('access_url')}>
                                        <Input
                                            value={form.url}
                                            onChange={(e) => set('url', e.target.value)}
                                            placeholder={t('access_ph_url')}
                                            autoComplete="off"
                                            inputMode="url"
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            spellCheck={false}
                                        />
                                    </Field>
                                </div>
                            </div>
                            {logoError && (
                                <p role="alert" className="text-destructive -mt-1.5 text-xs">
                                    {logoError}
                                </p>
                            )}
                            <ColorSwatchPicker label={t('access_color')} showLabel value={form.color} onChange={(hex) => set('color', hex)} />
                            <Field label={t('access_policy')}>
                                <Input value={form.policy} onChange={(e) => set('policy', e.target.value)} autoComplete="off" />
                            </Field>
                        </>
                    )}

                    {curKind === 'software' && (
                        <>
                            {/* Identity — logo beside name + brand */}
                            <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-5">
                                <LogoPicker
                                    preview={logoPreview}
                                    icon={Package}
                                    tone="amber"
                                    onPick={onLogo}
                                    onRemove={() => {
                                        setLogo(null);
                                        setRemoveLogo(true);
                                    }}
                                />
                                <div className="min-w-0 space-y-3">
                                    <Field label={t('access_software_name')} required name="name" error={errors.name}>
                                        <Input
                                            name="software_name"
                                            value={form.name}
                                            onChange={(e) => set('name', e.target.value)}
                                            placeholder={t('access_ph_software_name')}
                                            autoFocus
                                            autoComplete="off"
                                        />
                                    </Field>
                                    <Field label={t('access_publisher')}>
                                        <SearchableSelect
                                            value={form.brand_id}
                                            onChange={(v) => set('brand_id', v)}
                                            options={brandOptions}
                                            placeholder={t('access_select_brand')}
                                            clearable
                                        />
                                    </Field>
                                </div>
                            </div>
                            {logoError && (
                                <p role="alert" className="text-destructive -mt-1.5 text-xs">
                                    {logoError}
                                </p>
                            )}

                            {/* License */}
                            <div className="border-border space-y-3 border-t pt-3.5">
                                <h3 className="text-[14.5px] font-bold">{t('access_license_group')}</h3>
                                <LicenseTypePicker value={form.license_type} onChange={pickLicense} />
                                <SeatsField
                                    seats={form.seats}
                                    unlimited={form.seats_unlimited}
                                    autoUnlimited={form.seats_unlimited && isFreeLicense(form.license_type)}
                                    min={Math.max(1, seatsInUse)}
                                    error={errors.seats}
                                    onSeatsChange={(v) => set('seats', v)}
                                    onUnlimitedChange={setUnlimitedSeats}
                                />
                            </div>

                            {/* Product key */}
                            <div className="border-border border-t pt-3.5">
                                <ProductKeySection
                                    enabled={storeKey}
                                    onEnabledChange={setStoreKey}
                                    value={form.product_key}
                                    onChange={(v) => set('product_key', v)}
                                />
                            </div>

                            {/* Notes */}
                            <div className="border-border border-t pt-3.5">
                                <Field
                                    label={t('access_notes')}
                                    action={
                                        <span className="text-muted-foreground text-[11.5px] tabular-nums">
                                            {formatNumber(form.notes.length, lang)} / 2,000
                                        </span>
                                    }
                                >
                                    <Textarea
                                        rows={2}
                                        maxLength={2000}
                                        value={form.notes}
                                        onChange={(e) => set('notes', e.target.value)}
                                        placeholder={t('access_ph_notes')}
                                        autoComplete="off"
                                        className="min-h-16"
                                    />
                                </Field>
                            </div>
                        </>
                    )}
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center justify-between gap-2 border-t px-6 py-3 sm:rounded-b-lg">
                    <span className="text-muted-foreground text-[12.5px]">
                        <span className="text-destructive">*</span> {t('access_required_note')}
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                        <SaveButton loading={create.isPending || update.isPending} onClick={submit} disabled={!!row && !isDirty} />
                    </div>
                </div>
            </DialogContent>

            {/* Logo crop — shared 1:1 cropper, same as the employee photo flow. */}
            <PhotoCropDialog
                imageSrc={cropSrc}
                onConfirm={(cropped) => {
                    setLogo(cropped);
                    setRemoveLogo(false);
                    if (cropSrc) URL.revokeObjectURL(cropSrc);
                    setCropSrc(null);
                }}
                onCancel={() => {
                    if (cropSrc) URL.revokeObjectURL(cropSrc);
                    setCropSrc(null);
                }}
            />
        </Dialog>
    );
}
