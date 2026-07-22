import { useT } from '@/lang';
import { PhotoCropDialog, useDepartments, useEmployees } from '@/modules/employee';
import { useBrands } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn, focusFirstError } from '@/shared/lib/utils';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software, SoftwareLicenseType } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import {
    Code2,
    Eye,
    EyeOff,
    Folder,
    Gift,
    Globe,
    KeyRound,
    Lock,
    Package,
    RotateCw,
    ShieldCheck,
    Upload,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAccessMutations } from '../hooks/use-access';

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

/** License types shown as segmented cards; `key` = whether a product key is expected by default. */
const LICENSE_CARDS: { value: SoftwareLicenseType; icon: LucideIcon; expectsKey: boolean }[] = [
    { value: 'subscription', icon: RotateCw, expectsKey: true },
    { value: 'perpetual', icon: ShieldCheck, expectsKey: true },
    { value: 'open_source', icon: Code2, expectsKey: false },
    { value: 'free', icon: Gift, expectsKey: false },
];

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

/**
 * Logo upload control (preview tile + upload/remove buttons), shared by software
 * and social platforms. Picking a file goes through the parent's crop flow.
 */
function LogoField({
    preview,
    fallbackIcon: Icon,
    onPick,
    onRemove,
    error,
}: {
    preview: string | null;
    fallbackIcon: LucideIcon;
    onPick: (file?: File) => void;
    onRemove: () => void;
    error: string | null;
}) {
    const t = useT();
    return (
        <div className="flex items-center gap-4">
            <span className="bg-brand/10 text-brand grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full">
                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Icon className="h-6 w-6" />}
            </span>
            <div>
                <label className="border-input bg-background hover:bg-accent inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium">
                    <Upload className="h-4 w-4" />
                    {preview ? t('access_logo_change') : t('access_logo')}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
                </label>
                {preview && (
                    <button type="button" onClick={onRemove} className="text-destructive ml-2 text-sm hover:underline">
                        {t('access_logo_remove')}
                    </button>
                )}
                {error ? (
                    <p className="text-destructive mt-2 text-xs">{error}</p>
                ) : (
                    <p className="text-muted-foreground mt-2 text-xs">{t('access_logo_help')}</p>
                )}
            </div>
        </div>
    );
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
            seats: form.seats.trim() === '' ? null : Number(form.seats),
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
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useAccessMutations(kind);
    const { data: employees = [] } = useEmployees();
    const { data: departments = [] } = useDepartments();
    const { data: brands = [] } = useBrands();
    const [form, setForm] = useState<FormState>(empty);
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    // Software logo (upload/crop/remove) + product-key controls live outside FormState.
    const [logo, setLogo] = useState<File | null>(null);
    const [removeLogo, setRemoveLogo] = useState(false);
    const [cropSrc, setCropSrc] = useState<string | null>(null);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [storeKey, setStoreKey] = useState(false);
    const [showKey, setShowKey] = useState(false);
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

    useEffect(() => {
        if (open) {
            setForm(fromRow(kind, row));
            setErrors({});
            setLogo(null);
            setRemoveLogo(false);
            setCropSrc(null);
            setLogoError(null);
            setShowKey(false);
            // Key switch: on when a key is already stored, else follow the licence's default.
            const sw = kind === 'software' ? (row as Software | null) : null;
            const licence = sw?.license_type ?? 'subscription';
            setStoreKey(sw ? !!sw.product_key : (LICENSE_CARDS.find((c) => c.value === licence)?.expectsKey ?? false));
        }
    }, [open, kind, row]);

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

    // Hovering the Size input + scrolling nudges the value by ±1 instead of the browser's spinner arrows.
    const sizeInputRef = useWheelStep((delta) => {
        setForm((f) => ({ ...f, size_value: String(Math.max(0, (parseFloat(f.size_value) || 0) + delta)) }));
    });

    const employeeOptions = useMemo(
        () =>
            employees.map((e) => ({
                value: String(e.id),
                label: lang === 'th' ? (e.name_th ?? e.name) : e.name,
                sub: e.code,
                tag: e.department_id != null ? (deptTag.get(e.department_id) ?? undefined) : undefined,
                search: `${e.name} ${e.name_th ?? ''} ${e.code} ${e.department ?? ''}`,
            })),
        [employees, lang, deptTag],
    );
    const departmentOptions = useMemo(
        () =>
            departments.map((d) => ({
                value: String(d.id),
                label: lang === 'th' ? (d.name_th ?? d.name) : d.name,
                sub: d.tag,
                search: `${d.name} ${d.name_th ?? ''} ${d.tag}`,
            })),
        [departments, lang],
    );
    const brandOptions = useMemo(() => brands.map((b) => ({ value: String(b.id), label: b.name, search: b.name })), [brands]);

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
        return e;
    };

    const submit = async () => {
        const errs = validate();
        setErrors(errs);
        if (Object.keys(errs).length) {
            focusFirstError(errs as Record<string, string>);
            return;
        }
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
                    mapped[key] =
                        key === 'email' && /taken/i.test(msgs[0] ?? '') ? t('access_err_email_taken') : (msgs[0] ?? t('access_err_required'));
                }
                setErrors(mapped);
                focusFirstError(mapped as Record<string, string>);
                return;
            }
            throw err;
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
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[540px]">
                <FocusDialogHeader
                    icon={HEAD[curKind].icon}
                    accent={HEAD[curKind].color}
                    round
                    eyebrow={titleByKind[curKind]}
                    title={curRow ? t('edit') : t('access_add')}
                    code={curRow?.code ?? undefined}
                    srDescription={titleByKind[curKind]}
                />

                <div className="space-y-4 px-6 py-5">
                    {/* Software leads with its logo + a paired Publisher/Name row instead of the shared Name. */}
                    {curKind !== 'software' && (
                        <Field label={t('access_name')} required name="name" error={errors.name}>
                            <Input
                                value={form.name}
                                onChange={(e) => set('name', e.target.value)}
                                placeholder={
                                    curKind === 'email-groups'
                                        ? t('access_ph_group_name')
                                        : curKind === 'file-shares'
                                          ? t('access_ph_share_name')
                                          : t('access_ph_platform_name')
                                }
                                autoFocus
                            />
                        </Field>
                    )}

                    {curKind === 'email-groups' && (
                        <>
                            <Field label={t('access_email')} required name="email" error={errors.email}>
                                <Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder={t('access_ph_email')} />
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
                                        placeholder={t('access_pick_employee')}
                                    />
                                </Field>
                            )}
                            <Field label={t('access_description')}>
                                <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
                            </Field>
                        </>
                    )}

                    {curKind === 'file-shares' && (
                        <>
                            <Field label={t('access_path')} required name="path" error={errors.path}>
                                <Input value={form.path} onChange={(e) => set('path', e.target.value)} placeholder={t('access_ph_path')} />
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
                                        'border-input bg-background focus-within:ring-ring flex h-10 w-full overflow-hidden rounded-md border focus-within:ring-2 focus-within:ring-offset-2',
                                        errors.size_value && 'border-destructive',
                                    )}
                                >
                                    <input
                                        ref={sizeInputRef}
                                        type="text"
                                        inputMode="decimal"
                                        value={formatSizeValue(form.size_value)}
                                        onChange={(e) => set('size_value', e.target.value.replace(/,/g, '').replace(/[^\d.]/g, ''))}
                                        placeholder={t('access_ph_size')}
                                        title={lang === 'th' ? 'เลื่อนเมาส์ค้างแล้ว scroll เพื่อปรับทีละ 1' : 'Hover + scroll to nudge by 1'}
                                        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-2 text-right text-sm outline-hidden"
                                    />
                                    {/* When 0 (unlimited) the unit is meaningless — show the label instead of the picker. */}
                                    {parseFloat(form.size_value) === 0 ? (
                                        <span className="bg-muted/40 border-input text-muted-foreground grid w-24 shrink-0 place-items-center border-l px-3 text-sm font-medium">
                                            {t('access_size_unlimited')}
                                        </span>
                                    ) : (
                                        <Select value={form.size_unit} onValueChange={(v) => set('size_unit', v as SizeUnit)}>
                                            <SelectTrigger className="border-input bg-muted/40 h-full w-24 shrink-0 justify-center gap-1 rounded-none border-0 border-l px-3 text-sm focus:ring-0 focus:ring-offset-0">
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
                                        placeholder={t('access_pick_employee')}
                                    />
                                </Field>
                            )}
                            <Field label={t('access_description')}>
                                <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
                            </Field>
                        </>
                    )}

                    {curKind === 'social-platforms' && (
                        <>
                            {/* Platform logo — same upload/crop control as software. */}
                            <LogoField
                                preview={logoPreview}
                                fallbackIcon={Globe}
                                onPick={onLogo}
                                onRemove={() => {
                                    setLogo(null);
                                    setRemoveLogo(true);
                                }}
                                error={logoError}
                            />
                            <Field label={t('access_url')}>
                                <Input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder={t('access_ph_url')} />
                            </Field>
                            <Field label={t('access_color')}>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={form.color || '#6366f1'}
                                        onChange={(e) => set('color', e.target.value)}
                                        className="border-input bg-background h-10 w-12 shrink-0 rounded-md border p-1"
                                    />
                                    <Input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder={t('access_ph_color')} />
                                </div>
                            </Field>
                            <Field label={t('access_policy')}>
                                <Input value={form.policy} onChange={(e) => set('policy', e.target.value)} />
                            </Field>
                        </>
                    )}

                    {curKind === 'software' && (
                        <>
                            {/* Logo — same control as the employee profile photo (preview + upload/remove + crop). */}
                            <LogoField
                                preview={logoPreview}
                                fallbackIcon={Package}
                                onPick={onLogo}
                                onRemove={() => {
                                    setLogo(null);
                                    setRemoveLogo(true);
                                }}
                                error={logoError}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('access_publisher')}>
                                    <SearchableSelect
                                        value={form.brand_id}
                                        onChange={(v) => set('brand_id', v)}
                                        options={brandOptions}
                                        placeholder={t('access_select_brand')}
                                        clearable
                                    />
                                </Field>
                                <Field label={t('access_name')} required name="name" error={errors.name}>
                                    <Input
                                        value={form.name}
                                        onChange={(e) => set('name', e.target.value)}
                                        placeholder={t('access_ph_software_name')}
                                    />
                                </Field>
                            </div>

                            {/* License as segmented cards */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium">{t('access_license_type')}</label>
                                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('access_license_type')}>
                                    {LICENSE_CARDS.map(({ value, icon: LicIcon, expectsKey }) => {
                                        const on = form.license_type === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                onClick={() => {
                                                    set('license_type', value);
                                                    setStoreKey(expectsKey);
                                                }}
                                                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-center transition-colors ${
                                                    on ? 'border-brand bg-brand/10 text-brand' : 'border-input hover:border-brand/40'
                                                }`}
                                            >
                                                <LicIcon className={`h-[18px] w-[18px] ${on ? 'text-brand' : 'text-muted-foreground'}`} />
                                                <span className="text-[12.5px] leading-tight font-semibold">{t(`access_lic_${value}`)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Seats — its own field so it reads as a real, countable attribute */}
                            <div>
                                <label htmlFor="sw-seats" className="mb-1.5 block text-sm font-medium">
                                    {t('access_seats')}
                                </label>
                                <div className="border-input bg-background focus-within:ring-ring flex h-10 max-w-[220px] items-center gap-2.5 rounded-md border px-3 focus-within:ring-2 focus-within:ring-offset-2">
                                    <Users className="text-muted-foreground h-4 w-4 shrink-0" />
                                    <input
                                        id="sw-seats"
                                        type="number"
                                        min="0"
                                        value={form.seats}
                                        onChange={(e) => set('seats', e.target.value)}
                                        placeholder={t('access_ph_seats')}
                                        className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-hidden"
                                    />
                                    <span className="text-muted-foreground shrink-0 text-xs">{t('access_seats_unit')}</span>
                                </div>
                                <p className="text-muted-foreground mt-1.5 text-xs">{t('access_seats_help')}</p>
                            </div>

                            {/* Product key — switch reveals a masked, monospace field (it is a secret). */}
                            <div className={`overflow-hidden rounded-xl border ${storeKey ? 'border-brand/40' : 'border-border'}`}>
                                <div className="flex items-center gap-3 p-3">
                                    <span
                                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${storeKey ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground'}`}
                                    >
                                        <KeyRound className="h-[17px] w-[17px]" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-semibold">{t('access_store_key')}</div>
                                        <div className="text-muted-foreground text-xs">{t('access_store_key_hint')}</div>
                                    </div>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={storeKey}
                                        onClick={() => setStoreKey((v) => !v)}
                                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${storeKey ? 'bg-brand' : 'bg-input'}`}
                                    >
                                        <span
                                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${storeKey ? 'left-0.5 translate-x-5' : 'left-0.5'}`}
                                        />
                                    </button>
                                </div>
                                {storeKey && (
                                    <div className="px-3 pb-3">
                                        <div className="relative">
                                            <Input
                                                type={showKey ? 'text' : 'password'}
                                                value={form.product_key}
                                                onChange={(e) => set('product_key', e.target.value)}
                                                placeholder={t('access_ph_product_key')}
                                                className="pr-11 font-mono tracking-wider"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey((v) => !v)}
                                                aria-label={showKey ? t('access_key_hide') : t('access_key_show')}
                                                className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1/2 right-1.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md"
                                            >
                                                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </button>
                                        </div>
                                        <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[11.5px]">
                                            <Lock className="h-3 w-3 shrink-0" />
                                            {t('access_key_secure')}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <Field label={t('access_notes')}>
                                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                            </Field>
                        </>
                    )}
                </div>

                <div className="border-border/60 bg-muted/30 flex items-center justify-end gap-2 border-t px-6 py-3">
                    <Button variant="ghost" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={create.isPending || update.isPending} onClick={submit} disabled={!!row && !isDirty} />
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
