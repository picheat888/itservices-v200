import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useAccessMutations } from '../hooks/use-access';
import { useDepartments, useEmployees } from '@/modules/employee';
import { useT } from '@/lang';
import { useUiStore } from '@/stores/ui';
import type { AccessKind, EmailGroup, FileShare, SocialPlatform, Software, SoftwareLicenseType } from '@/shared/types';
import { useEffect, useMemo, useState } from 'react';

type AnyResource = EmailGroup | FileShare | SocialPlatform | Software;

// The full form state covers every field across the four kinds; only the
// fields relevant to the active kind are rendered and submitted.
type FormState = {
    name: string;
    email: string;
    description: string;
    path: string;
    size_label: string;
    url: string;
    color: string;
    policy: string;
    owner_employee_id: string;
    department_id: string;
    publisher: string;
    version: string;
    license_type: SoftwareLicenseType;
    seats: string;
    notes: string;
};

const empty: FormState = {
    name: '',
    email: '',
    description: '',
    path: '',
    size_label: '',
    url: '',
    color: '',
    policy: '',
    owner_employee_id: '',
    department_id: '',
    publisher: '',
    version: '',
    license_type: 'subscription',
    seats: '',
    notes: '',
};

/** Hydrate the form from an existing row (edit) or reset to blank (create). */
function fromRow(kind: AccessKind, row: AnyResource | null): FormState {
    if (!row) return empty;
    if (kind === 'email-groups') {
        const r = row as EmailGroup;
        return { ...empty, name: r.name, email: r.email, description: r.description ?? '', owner_employee_id: r.owner_employee_id ? String(r.owner_employee_id) : '', department_id: r.department_id ? String(r.department_id) : '' };
    }
    if (kind === 'file-shares') {
        const r = row as FileShare;
        return { ...empty, name: r.name, path: r.path, size_label: r.size_label ?? '', owner_employee_id: r.owner_employee_id ? String(r.owner_employee_id) : '', department_id: r.department_id ? String(r.department_id) : '' };
    }
    if (kind === 'software') {
        const r = row as Software;
        return {
            ...empty,
            name: r.name,
            publisher: r.publisher ?? '',
            version: r.version ?? '',
            license_type: r.license_type,
            seats: r.seats != null ? String(r.seats) : '',
            notes: '',
            department_id: r.department_id ? String(r.department_id) : '',
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
            owner_employee_id: form.owner_employee_id ? Number(form.owner_employee_id) : null,
            department_id: form.department_id ? Number(form.department_id) : null,
        };
    }
    if (kind === 'file-shares') {
        return {
            name: form.name.trim(),
            path: form.path.trim(),
            size_label: form.size_label.trim() || null,
            owner_employee_id: form.owner_employee_id ? Number(form.owner_employee_id) : null,
            department_id: form.department_id ? Number(form.department_id) : null,
        };
    }
    if (kind === 'software') {
        return {
            name: form.name.trim(),
            publisher: form.publisher.trim() || null,
            version: form.version.trim() || null,
            license_type: form.license_type,
            seats: form.seats.trim() === '' ? null : Number(form.seats),
            department_id: form.department_id ? Number(form.department_id) : null,
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
    const [form, setForm] = useState<FormState>(empty);

    useEffect(() => {
        if (open) setForm(fromRow(kind, row));
    }, [open, kind, row]);

    const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const employeeOptions = useMemo(
        () => employees.map((e) => ({ value: String(e.id), label: lang === 'th' ? (e.name_th ?? e.name) : e.name, sub: e.code, search: `${e.name} ${e.name_th ?? ''} ${e.code}` })),
        [employees, lang],
    );
    const departmentOptions = useMemo(
        () => departments.map((d) => ({ value: String(d.id), label: lang === 'th' ? (d.name_th ?? d.name) : d.name, sub: d.tag, search: `${d.name} ${d.name_th ?? ''} ${d.tag}` })),
        [departments, lang],
    );

    // A few fields are mandatory before the form can be saved (matches backend rules).
    const valid =
        kind === 'email-groups'
            ? !!form.name.trim() && !!form.email.trim()
            : kind === 'file-shares'
              ? !!form.name.trim() && !!form.path.trim()
              : !!form.name.trim();

    const submit = async () => {
        if (!valid) return;
        const payload = toPayload(kind, form);
        if (row) await update.mutateAsync({ id: row.id, payload });
        else await create.mutateAsync(payload);
        onClose();
    };

    const titleByKind: Record<AccessKind, string> = {
        'email-groups': t('access_email_groups'),
        'file-shares': t('access_file_shares'),
        'social-platforms': t('access_social'),
        'software': t('access_software'),
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {row ? t('edit') : t('access_add')} · {titleByKind[kind]}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <Field label={t('access_name')} required>
                        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
                    </Field>

                    {kind === 'email-groups' && (
                        <>
                            <Field label={t('access_email')} required>
                                <Input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="group@company.com" />
                            </Field>
                            <Field label={t('access_description')}>
                                <Input value={form.description} onChange={(e) => set('description', e.target.value)} />
                            </Field>
                            <Field label={t('access_owner')}>
                                <SearchableSelect value={form.owner_employee_id} onChange={(v) => set('owner_employee_id', v)} options={employeeOptions} placeholder={t('access_pick_employee')} clearable />
                            </Field>
                            <Field label={t('access_department')}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} clearable />
                            </Field>
                        </>
                    )}

                    {kind === 'file-shares' && (
                        <>
                            <Field label={t('access_path')} required>
                                <Input value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="\\\\server\\share" />
                            </Field>
                            <Field label={t('access_size')}>
                                <Input value={form.size_label} onChange={(e) => set('size_label', e.target.value)} placeholder="120 GB" />
                            </Field>
                            <Field label={t('access_owner')}>
                                <SearchableSelect value={form.owner_employee_id} onChange={(v) => set('owner_employee_id', v)} options={employeeOptions} placeholder={t('access_pick_employee')} clearable />
                            </Field>
                            <Field label={t('access_department')}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} clearable />
                            </Field>
                        </>
                    )}

                    {kind === 'social-platforms' && (
                        <>
                            <Field label={t('access_url')}>
                                <Input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
                            </Field>
                            <Field label={t('access_color')}>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={form.color || '#6366f1'}
                                        onChange={(e) => set('color', e.target.value)}
                                        className="border-input h-10 w-12 shrink-0 rounded-md border bg-background p-1"
                                    />
                                    <Input value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="#6366f1" />
                                </div>
                            </Field>
                            <Field label={t('access_policy')}>
                                <Input value={form.policy} onChange={(e) => set('policy', e.target.value)} />
                            </Field>
                        </>
                    )}

                    {kind === 'software' && (
                        <>
                            <Field label={t('access_publisher')}>
                                <Input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} placeholder="Adobe" />
                            </Field>
                            <Field label={t('access_version')}>
                                <Input value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="2024" />
                            </Field>
                            <Field label={t('access_license_type')}>
                                <select
                                    value={form.license_type}
                                    onChange={(e) => set('license_type', e.target.value as SoftwareLicenseType)}
                                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                                >
                                    <option value="subscription">{t('access_lic_subscription')}</option>
                                    <option value="perpetual">{t('access_lic_perpetual')}</option>
                                    <option value="free">{t('access_lic_free')}</option>
                                    <option value="open_source">{t('access_lic_open_source')}</option>
                                </select>
                            </Field>
                            <Field label={t('access_seats')}>
                                <Input type="number" min="0" value={form.seats} onChange={(e) => set('seats', e.target.value)} placeholder="10" />
                            </Field>
                            <Field label={t('access_department')}>
                                <SearchableSelect value={form.department_id} onChange={(v) => set('department_id', v)} options={departmentOptions} clearable />
                            </Field>
                            <Field label={t('access_notes')}>
                                <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                            </Field>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={!valid || create.isPending || update.isPending}>
                        {t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
