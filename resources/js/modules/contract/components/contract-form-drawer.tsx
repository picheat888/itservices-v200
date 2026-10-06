import { useT } from '@/lang';
import { assetApi } from '@/modules/asset';
import { useCurrency, useVendors } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import { type BillingCycle, type Contract, type ContractAttachment, type ContractType, type Vendor } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, Cog, FileText, Info, Laptop, Loader2, Lock, Package, Paperclip, Search, Wifi, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useContractMutations } from '../hooks/use-contracts';

const MAX_FILES = 5;
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const TYPE_META: { value: ContractType; icon: typeof FileText; labelKey: string; subKey: string }[] = [
    { value: 'software', icon: FileText, labelKey: 'contract_type_software', subKey: 'contract_type_software_sub' },
    { value: 'hardware', icon: Laptop, labelKey: 'contract_type_hardware', subKey: 'contract_type_hardware_sub' },
    { value: 'service', icon: Cog, labelKey: 'contract_type_service', subKey: 'contract_type_service_sub' },
    { value: 'connectivity', icon: Wifi, labelKey: 'contract_type_connectivity', subKey: 'contract_type_connectivity_sub' },
    { value: 'other', icon: Package, labelKey: 'contract_type_other', subKey: 'contract_type_other_sub' },
];

const REMINDER_DAYS = [150, 120, 90, 60, 45, 30, 7] as const;
type ReminderKey = 'notify_150' | 'notify_120' | 'notify_90' | 'notify_60' | 'notify_45' | 'notify_30' | 'notify_7';

const LAST_STEP = 5;
/** Required fields owned by each step — used to validate on "Next" and to jump to the first error on Save. */
const STEP_FIELDS: string[][] = [
    [], // 0 · type (always valid — has a default)
    ['code', 'details', 'vendor_id', 'name'], // 1 · contract info
    ['start_date', 'end_date', 'value'], // 2 · term & value
    ['notify'], // 3 · reminders
    [], // 4 · link assets (optional)
    [], // 5 · review
];
/** Maps an error field back to the step that owns it, so Save can jump there. */
const FIELD_STEP: Record<string, number> = {
    code: 1,
    details: 1,
    vendor_id: 1,
    name: 1,
    start_date: 2,
    end_date: 2,
    value: 2,
    total_value: 2,
    notify: 3,
};

/** Keep digits + a single decimal point, capped at 2 decimal places (money input). */
function sanitizeMoney(raw: string): string {
    let s = raw.replace(/[^\d.]/g, '');
    const dot = s.indexOf('.');
    if (dot !== -1) {
        s =
            s.slice(0, dot + 1) +
            s
                .slice(dot + 1)
                .replace(/\./g, '')
                .slice(0, 2);
    }
    return s;
}

/** Group the integer part with commas while preserving a typed dot / decimals. */
function displayMoney(s: string): string {
    if (!s) return '';
    const [intPart, decPart] = s.split('.');
    const intFmt = intPart ? Number(intPart).toLocaleString('en-US') : '';
    return s.includes('.') ? `${intFmt}.${decPart ?? ''}` : intFmt;
}

interface FormState {
    code: string;
    type: ContractType;
    vendor_id: string;
    details: string;
    name: string;
    start_date: string;
    end_date: string;
    value: string;
    total_value: string;
    billing_cycle: BillingCycle;
    notify_150: boolean;
    notify_120: boolean;
    notify_90: boolean;
    notify_60: boolean;
    notify_45: boolean;
    notify_30: boolean;
    notify_7: boolean;
    notes: string;
    /** Asset links — only ever populated for hardware contracts (the only type that can hold assets). */
    asset_ids: number[];
}

const EMPTY: FormState = {
    code: '',
    type: 'software',
    vendor_id: '',
    details: '',
    name: '',
    start_date: '',
    end_date: '',
    value: '',
    total_value: '',
    billing_cycle: 'yearly',
    notify_150: false,
    notify_120: false,
    notify_90: false,
    notify_60: false,
    notify_45: false,
    notify_30: false,
    notify_7: false,
    notes: '',
    asset_ids: [],
};

/**
 * Multi-step focus dialog used for both creating a new contract and editing an existing one.
 * Walks the user through: type → details → term/value → reminders → linked assets → review.
 */
export function ContractFormDrawer({
    open,
    editing,
    onClose,
    onCreated,
}: {
    open: boolean;
    editing: Contract | null;
    onClose: () => void;
    /** Called after a new contract is successfully saved — receives the created contract. */
    onCreated?: (contract: Contract) => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol } = useCurrency();
    const { create, update, uploadAttachments, deleteAttachment } = useContractMutations();
    const { data: vendors = [] } = useVendors();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [step, setStep] = useState(0);

    // Rough auto-estimate of the whole-contract total (value/cycle × billing
    // cycles between start & end) — a reference the admin can check against or
    // click to fill. The saved total is whatever they type into the manual field.
    const totalValueEstimate = (() => {
        const v = Number(form.value);
        if (!v || !form.start_date || !form.end_date) return null;
        const start = new Date(form.start_date);
        const end = new Date(form.end_date);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
        const months =
            (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + (end.getDate() >= start.getDate() ? 0 : -1);
        const raw = form.billing_cycle === 'monthly' ? months : form.billing_cycle === 'quarterly' ? months / 3 : months / 12;
        return Math.round(v * Math.max(1, Math.round(raw)) * 100) / 100;
    })();

    // Attachments: already-saved files (with pending removals) + newly picked files
    // not yet uploaded. Both are applied when the form is saved.
    const [existing, setExisting] = useState<ContractAttachment[]>([]);
    const [removedIds, setRemovedIds] = useState<number[]>([]);
    const [pending, setPending] = useState<File[]>([]);
    const [fileErr, setFileErr] = useState('');

    const vendorOptions = useMemo(() => {
        // Value is the vendor id (FK); only the label follows the active language so
        // the Thai name surfaces.
        return (vendors as Vendor[]).map((v) => ({
            value: String(v.id),
            label: lang === 'th' ? (v.name_th ?? v.name) : v.name,
            search: `${v.name} ${v.name_th ?? ''}`,
        }));
    }, [vendors, lang]);
    const [err, setErr] = useState<Record<string, string>>({});
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');

    // Hydrate the form when opening; editing populates from the contract.
    useEffect(() => {
        if (!open) return;
        setErr({});
        setSaveState('idle');
        setStep(0);
        setAssetSearch('');
        setExisting(editing?.attachments ?? []);
        setRemovedIds([]);
        setPending([]);
        setFileErr('');
        if (editing) {
            setForm({
                code: editing.code,
                type: editing.type,
                vendor_id: editing.vendor_id ? String(editing.vendor_id) : '',
                details: editing.details ?? '',
                name: editing.name,
                start_date: editing.start,
                end_date: editing.end,
                value: String(editing.value),
                total_value: editing.total_value != null ? String(editing.total_value) : '',
                billing_cycle: editing.billing_cycle,
                notify_150: editing.notify_150,
                notify_120: editing.notify_120,
                notify_90: editing.notify_90,
                notify_60: editing.notify_60,
                notify_45: editing.notify_45,
                notify_30: editing.notify_30,
                notify_7: editing.notify_7,
                notes: editing.notes ?? '',
                asset_ids: editing.linked_assets?.map((a) => a.id) ?? [],
            });
        } else {
            setForm(EMPTY);
        }
    }, [open, editing]);

    /** Update one field and drop its validation error — editing counts as fixing it.
     *  Error keys match field names, except the notify_* checkboxes which share 'notify'. */
    const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => {
        setForm((f) => ({ ...f, [k]: v }));
        const errKey = k.startsWith('notify_') ? 'notify' : k;
        setErr((prev) => {
            if (!(errKey in prev)) return prev;
            const next = { ...prev };
            delete next[errKey];
            return next;
        });
    };

    // Only hardware contracts can hold assets — the whole "link assets" step keys off this.
    const isHardware = form.type === 'hardware';

    // Linked-assets picker: loaded only for hardware contracts (the only type that can link assets).
    const [assetSearch, setAssetSearch] = useState('');
    const { data: linkableAssets = [], isLoading: assetsLoading } = useQuery({
        queryKey: ['assets-linkable', editing?.id ?? 'new'],
        queryFn: () => assetApi.linkable(editing?.id),
        enabled: open && isHardware,
    });
    const filteredAssets = useMemo(() => {
        const q = assetSearch.trim().toLowerCase();
        if (!q) return linkableAssets;
        return linkableAssets.filter((a) => `${a.asset_code} ${a.name}`.toLowerCase().includes(q));
    }, [linkableAssets, assetSearch]);
    const toggleAsset = (id: number) =>
        setForm((f) => ({ ...f, asset_ids: f.asset_ids.includes(id) ? f.asset_ids.filter((x) => x !== id) : [...f.asset_ids, id] }));

    const visibleExisting = existing.filter((a) => !removedIds.includes(a.id));
    const atMax = visibleExisting.length + pending.length >= MAX_FILES;

    // Validate picked files client-side (PDF only, ≤25MB, within the count cap).
    const onPickFiles = (list: FileList | null) => {
        if (!list) return;
        setFileErr('');
        let slots = MAX_FILES - visibleExisting.length - pending.length;
        const accepted: File[] = [];
        for (const f of Array.from(list)) {
            const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
            if (!isPdf) {
                setFileErr(t('attachment_pdf_only'));
                continue;
            }
            if (f.size > MAX_SIZE) {
                setFileErr(t('attachment_too_big'));
                continue;
            }
            if (slots <= 0) {
                setFileErr(t('attachment_max'));
                break;
            }
            accepted.push(f);
            slots--;
        }
        if (accepted.length) setPending((p) => [...p, ...accepted]);
    };

    /** Collect every validation error across the whole form (used on Save). */
    const buildErrors = (): Record<string, string> => {
        const e: Record<string, string> = {};
        const required = t('contract_err_required');
        if (!form.code.trim()) e.code = required;
        if (!form.vendor_id) e.vendor_id = required;
        if (!form.details.trim()) e.details = required;
        if (!form.name.trim()) e.name = required;
        if (!form.start_date) e.start_date = required;
        if (!form.end_date) e.end_date = required;
        if (!form.value.trim()) e.value = required;
        if (!editing && !form.total_value.trim()) e.total_value = required;
        if (form.start_date && form.end_date && form.end_date < form.start_date) {
            e.end_date = t('contract_err_end_before_start');
        }
        if (!REMINDER_DAYS.some((d) => form[`notify_${d}` as ReminderKey])) {
            e.notify = t('contract_err_notify_required');
        }
        return e;
    };

    // Navigate to a target step. Going back is always allowed; going forward (incl. via the
    // stepper icons) must pass the required-field validation of every step in between.
    const goToStep = (target: number) => {
        const clamped = Math.max(0, Math.min(target, LAST_STEP));
        if (clamped <= step) {
            setErr({});
            setStep(clamped);
            return;
        }
        const all = buildErrors();
        for (let s = step; s < clamped; s++) {
            const bad = STEP_FIELDS[s].filter((f) => all[f]);
            if (bad.length) {
                setErr(Object.fromEntries(bad.map((f) => [f, all[f]])));
                setStep(s);
                return;
            }
        }
        setErr({});
        setStep(clamped);
    };
    const goNext = () => goToStep(step + 1);
    const goBack = () => goToStep(step - 1);

    const submit = async () => {
        // Full validation on save — jump to the earliest step that still has an error.
        const e = buildErrors();
        if (Object.keys(e).length) {
            setErr(e);
            const firstStep = Math.min(...Object.keys(e).map((f) => FIELD_STEP[f] ?? 1));
            setStep(firstStep);
            return;
        }
        setErr({});

        const payload = {
            code: form.code.trim(),
            type: form.type,
            vendor_id: Number(form.vendor_id),
            details: form.details.trim(),
            name: form.name.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            value: Number(form.value),
            total_value: form.total_value ? Number(form.total_value) : null,
            billing_cycle: form.billing_cycle,
            notify_150: form.notify_150,
            notify_120: form.notify_120,
            notify_90: form.notify_90,
            notify_60: form.notify_60,
            notify_45: form.notify_45,
            notify_30: form.notify_30,
            notify_7: form.notify_7,
            notes: form.notes.trim() || null,
            // Hardware links its selection; every other type clears links (sends []).
            asset_ids: isHardware ? form.asset_ids : [],
        };

        try {
            // Persist the contract first so a new one has an id to attach files to.
            const saved = editing ? await update.mutateAsync({ id: editing.id, payload }) : await create.mutateAsync(payload);
            const id = editing ? editing.id : saved.id;

            for (const attachmentId of removedIds) {
                await deleteAttachment.mutateAsync({ id, attachmentId });
            }
            if (pending.length) {
                await uploadAttachments.mutateAsync({ id, files: pending });
            }

            setSaveState('done');
            if (!editing) onCreated?.(saved as Contract);
            setTimeout(() => {
                setSaveState('idle');
                onClose();
            }, 700);
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setFileErr(msg || t('attachment_upload_failed'));
            // Surface upload errors on the contract-info step where attachments live.
            setStep(1);
        }
    };

    const saving = create.isPending || update.isPending || uploadAttachments.isPending || deleteAttachment.isPending;
    // Mirrors ContractService::assertKeepsRetiredAssets — the server refuses the switch too.
    const typeLocked = editing?.type === 'hardware' && (editing.linked_assets ?? []).some((a) => a.status === 'writeoff');

    // Step labels (lang keys) for the horizontal stepper.
    const steps = [
        'contract_label_type',
        'contract_step_details',
        'contract_section_term',
        'contract_step_reminders',
        'contract_step_link_assets',
        'contract_label_review',
    ];

    const TypeIcon = TYPE_META.find((m) => m.value === form.type)?.icon ?? FileText;
    const selectedNotify = REMINDER_DAYS.filter((d) => form[`notify_${d}` as ReminderKey]);
    const attachmentCount = visibleExisting.length + pending.length;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {/* Header */}
                <FocusDialogHeader
                    icon={TypeIcon}
                    eyebrow={editing ? t('contract_form_edit') : t('contract_form_new')}
                    title={editing ? t('contract_form_edit') : t('new_contract')}
                    code={editing ? editing.code : undefined}
                    srDescription={t('contract_register_sub')}
                />

                {/* Horizontal stepper */}
                <div className="border-border/60 flex items-start border-b px-6 pb-4">
                    {steps.map((s, i) => {
                        const active = i === step;
                        const done = i < step;
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => goToStep(i)}
                                className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
                            >
                                {i < steps.length - 1 && (
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
                                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                                </span>
                                <span
                                    className={cn(
                                        'text-[11.5px] leading-tight font-semibold transition-colors',
                                        active ? 'text-brand' : done ? 'text-foreground' : 'text-muted-foreground',
                                    )}
                                >
                                    {t(s)}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Body — only this scrolls */}
                <div className="flex-1 overflow-y-auto px-6 py-7">
                    <div key={step} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                        {/* ── Step 1 · Type ───────────────────────────── */}
                        {step === 0 && (
                            <div className="mx-auto w-full max-w-[820px]">
                                <p className="text-brand mb-1 text-xs font-bold tracking-wide uppercase">
                                    {t('contract_step_n').replace('{n}', '1')}
                                </p>
                                <h2 className="text-xl font-extrabold tracking-tight">{t('contract_type')}</h2>
                                <p className="text-muted-foreground mt-1 mb-6 text-sm">{t('contract_step_type_sub')}</p>
                                {/* A hardware contract holding assets that already came back (returned or written
                                    off) stays hardware: they cannot be unlinked, which another type would need. */}
                                {typeLocked && (
                                    <p className="text-muted-foreground -mt-3 mb-4 flex items-center gap-1.5 text-xs">
                                        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        {t('contract_type_locked')}
                                    </p>
                                )}
                                <div className="grid grid-cols-5 gap-3">
                                    {TYPE_META.map((tp) => {
                                        const Icon = tp.icon;
                                        const sel = form.type === tp.value;
                                        return (
                                            <ChoiceCard
                                                key={tp.value}
                                                selected={sel}
                                                disabled={typeLocked && tp.value !== 'hardware'}
                                                onClick={() => {
                                                    upd('type', tp.value);
                                                    // Only hardware contracts can hold assets — drop any selection on other types.
                                                    if (tp.value !== 'hardware') setForm((f) => ({ ...f, asset_ids: [] }));
                                                }}
                                                className={cn(
                                                    'flex flex-col items-center gap-2.5 rounded-xl p-5 text-center disabled:cursor-not-allowed disabled:opacity-50',
                                                    sel && 'text-brand',
                                                )}
                                            >
                                                <Icon className="h-6 w-6" />
                                                <span className="text-[13px] leading-tight font-semibold">
                                                    {t(tp.labelKey)}
                                                    <span className="text-muted-foreground mt-0.5 block text-[11px] font-medium">{t(tp.subKey)}</span>
                                                </span>
                                            </ChoiceCard>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Step 2 · Contract info (+ attachments) ───── */}
                        {step === 1 && (
                            <div className="mx-auto w-full max-w-[860px] space-y-6">
                                <StepHead num={2} title={t('contract_step_details_title')} sub={t('contract_step_details_sub')} />

                                <div className="grid grid-cols-2 gap-6">
                                    {/* Left — contract info */}
                                    <div className="space-y-5">
                                        <Field label={t('contract_code')} help={t('contract_code_hint')} required error={err.code} name="code">
                                            <Input
                                                value={form.code}
                                                onChange={(e) => upd('code', e.target.value)}
                                                placeholder="CT-2026-001"
                                                className="font-mono"
                                            />
                                        </Field>

                                        <Field label={t('contract_details')} required error={err.details} name="details">
                                            <Input
                                                value={form.details}
                                                onChange={(e) => upd('details', e.target.value)}
                                                placeholder={t('contract_details_ph')}
                                            />
                                        </Field>

                                        <Field label={t('contract_vendor')} required error={err.vendor_id} name="vendor_id">
                                            <SearchableSelect
                                                value={form.vendor_id}
                                                onChange={(v) => upd('vendor_id', v)}
                                                options={vendorOptions}
                                                placeholder={t('contract_vendor_ph')}
                                            />
                                        </Field>

                                        <Field label={t('contract_name')} required error={err.name} name="name">
                                            <Input
                                                value={form.name}
                                                onChange={(e) => upd('name', e.target.value)}
                                                placeholder={t('contract_name_ph')}
                                            />
                                        </Field>

                                        <Field label={t('contract_notes')}>
                                            <Textarea
                                                value={form.notes}
                                                onChange={(e) => upd('notes', e.target.value)}
                                                rows={3}
                                                placeholder={t('contract_notes_ph')}
                                            />
                                        </Field>
                                    </div>

                                    {/* Right — attachments */}
                                    <Field label={t('contract_attachments')}>
                                        <div className="space-y-2">
                                            {visibleExisting.length === 0 && pending.length === 0 && (
                                                <p className="text-muted-foreground text-xs">{t('attachment_none')}</p>
                                            )}

                                            {visibleExisting.map((a) => (
                                                <div
                                                    key={`e-${a.id}`}
                                                    className="border-border flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                >
                                                    <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                                                    <a
                                                        href={a.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hover:text-brand min-w-0 flex-1 truncate hover:underline"
                                                    >
                                                        {a.name}
                                                    </a>
                                                    <span className="text-muted-foreground shrink-0 text-xs">{formatSize(a.size)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setRemovedIds((r) => [...r, a.id])}
                                                        className="text-muted-foreground hover:bg-accent hover:text-destructive shrink-0 rounded-md p-1"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}

                                            {pending.map((f, i) => (
                                                <div
                                                    key={`p-${i}`}
                                                    className="border-brand/30 bg-brand/5 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                >
                                                    <FileText className="text-brand h-4 w-4 shrink-0" />
                                                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                                    <span className="bg-brand/10 text-brand shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                                                        {t('attachment_new')}
                                                    </span>
                                                    <span className="text-muted-foreground shrink-0 text-xs">{formatSize(f.size)}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                                                        className="text-muted-foreground hover:bg-accent hover:text-destructive shrink-0 rounded-md p-1"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ))}

                                            {!atMax && (
                                                <label className="border-input text-muted-foreground hover:text-brand flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-sm hover:bg-[#c4c4c40f]">
                                                    <Paperclip className="h-4 w-4" />
                                                    <span>{t('attachment_pick')}</span>
                                                    <input
                                                        type="file"
                                                        accept="application/pdf"
                                                        multiple
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            onPickFiles(e.target.files);
                                                            e.target.value = '';
                                                        }}
                                                    />
                                                </label>
                                            )}

                                            {fileErr ? (
                                                <p className="text-destructive text-xs">{fileErr}</p>
                                            ) : (
                                                <p className="text-muted-foreground text-xs">{t('attachment_hint')}</p>
                                            )}
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ── Step 3 · Term & value ───────────────────── */}
                        {step === 2 && (
                            <div className="mx-auto w-full max-w-[560px] space-y-5">
                                <StepHead num={3} title={t('contract_step_term_title')} sub={t('contract_step_term_sub')} />

                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={t('contract_start')} required error={err.start_date} name="start_date">
                                        <DateInput value={form.start_date} onChange={(v) => upd('start_date', v)} />
                                    </Field>
                                    <Field label={t('contract_end')} required error={err.end_date} name="end_date">
                                        <DateInput value={form.end_date} onChange={(v) => upd('end_date', v)} />
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={`${t('contract_value_per_cycle')} (${symbol})`} required error={err.value} name="value">
                                        <Input
                                            type="text"
                                            inputMode="decimal"
                                            className="font-mono"
                                            value={displayMoney(form.value)}
                                            onChange={(e) => upd('value', sanitizeMoney(e.target.value))}
                                            placeholder="0.00"
                                        />
                                    </Field>
                                    <Field label={t('contract_billing')}>
                                        <SearchableSelect
                                            value={form.billing_cycle}
                                            onChange={(v) => upd('billing_cycle', v as BillingCycle)}
                                            options={[
                                                { value: 'monthly', label: t('contract_billing_monthly'), search: t('contract_billing_monthly') },
                                                {
                                                    value: 'quarterly',
                                                    label: t('contract_billing_quarterly'),
                                                    search: t('contract_billing_quarterly'),
                                                },
                                                { value: 'yearly', label: t('contract_billing_yearly'), search: t('contract_billing_yearly') },
                                            ]}
                                        />
                                    </Field>
                                </div>
                                <Field
                                    label={`${t('contract_total_value')} (${symbol})`}
                                    required={!editing}
                                    error={err.total_value}
                                    name="total_value"
                                >
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        className="font-mono"
                                        value={displayMoney(form.total_value)}
                                        onChange={(e) => upd('total_value', sanitizeMoney(e.target.value))}
                                        placeholder="0.00"
                                    />
                                    {totalValueEstimate != null && (
                                        <button
                                            type="button"
                                            onClick={() => upd('total_value', String(totalValueEstimate))}
                                            className="text-muted-foreground hover:text-brand mt-1 text-xs transition-colors"
                                        >
                                            {t('contract_estimate')} ≈{' '}
                                            <span className="text-foreground font-mono font-semibold">
                                                {symbol}
                                                {totalValueEstimate.toLocaleString()}
                                            </span>
                                            <span className="ml-3 underline-offset-2 hover:underline">{t('contract_estimate_use')}</span>
                                        </button>
                                    )}
                                </Field>
                            </div>
                        )}

                        {/* ── Step 4 · Reminders ──────────────────────── */}
                        {step === 3 && (
                            <div className="mx-auto w-full max-w-[560px] space-y-5">
                                <StepHead num={4} title={t('contract_step_reminders_title')} sub={t('contract_step_reminders_sub')} />
                                <Field label={t('contract_notify')} required error={err.notify}>
                                    <div className="flex flex-wrap gap-2">
                                        {REMINDER_DAYS.map((d) => {
                                            const key = `notify_${d}` as ReminderKey;
                                            const on = form[key];
                                            return (
                                                <button
                                                    type="button"
                                                    key={d}
                                                    onClick={() => upd(key, !on)}
                                                    className={cn(
                                                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                                        on
                                                            ? 'border-brand bg-brand/10 text-brand'
                                                            : 'border-border text-muted-foreground hover:bg-accent',
                                                    )}
                                                >
                                                    {t('contract_days_many').replace('{n}', String(d))}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </Field>
                            </div>
                        )}

                        {/* ── Step 5 · Link assets ────────────────────── */}
                        {step === 4 && (
                            <div className="mx-auto w-full max-w-[560px] space-y-5">
                                <StepHead num={5} title={t('contract_step_link_assets')} sub={t('contract_step_link_assets_sub')} />

                                {!isHardware ? (
                                    <div className="border-input bg-muted/40 text-muted-foreground flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm">
                                        <Info className="h-4 w-4 shrink-0" />
                                        {t('contract_link_assets_hardware_only')}
                                    </div>
                                ) : (
                                    <Field label={t('contract_link_assets')} help={t('contract_link_assets_sub')}>
                                        <div className="border-border overflow-hidden rounded-md border">
                                            <div className="border-border relative border-b">
                                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                                <Input
                                                    value={assetSearch}
                                                    onChange={(e) => setAssetSearch(e.target.value)}
                                                    placeholder={t('contract_link_assets_search_ph')}
                                                    className="border-0 pl-9 focus-visible:ring-0"
                                                />
                                            </div>
                                            <div className="max-h-72 overflow-auto">
                                                {assetsLoading ? (
                                                    <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                                                        {t('contract_link_assets_loading')}
                                                    </div>
                                                ) : filteredAssets.length === 0 ? (
                                                    <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                                                        {t('contract_link_assets_none')}
                                                    </div>
                                                ) : (
                                                    filteredAssets.map((a) => {
                                                        const checked = form.asset_ids.includes(a.id);
                                                        // A written-off asset already on this contract stays on it (the server
                                                        // refuses to unlink it): it is the contract's record of what came back.
                                                        const locked = checked && a.status === 'writeoff';
                                                        return (
                                                            <button
                                                                key={a.id}
                                                                type="button"
                                                                onClick={() => toggleAsset(a.id)}
                                                                disabled={locked}
                                                                title={locked ? t('contract_link_asset_locked') : undefined}
                                                                className="border-border/60 hover:bg-accent/40 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                        checked ? 'border-brand bg-brand text-brand-foreground' : 'border-input',
                                                                    )}
                                                                >
                                                                    {checked && <Check className="h-3 w-3" />}
                                                                </span>
                                                                <span className="font-mono text-xs">{a.asset_code}</span>
                                                                <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                                                                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                                                                    {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
                                                                    {a.status.replace(/_/g, ' ')}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="border-border text-muted-foreground border-t px-3 py-1.5 text-xs">
                                                {t('contract_link_assets_selected').replace('{n}', String(form.asset_ids.length))}
                                            </div>
                                        </div>
                                    </Field>
                                )}
                            </div>
                        )}

                        {/* ── Step 6 · Review ─────────────────────────── */}
                        {step === 5 && (
                            <div className="mx-auto w-full max-w-[640px] space-y-5">
                                <StepHead num={6} title={t('contract_step_review_title')} sub={t('contract_step_review_sub')} />

                                <div className="border-border overflow-hidden rounded-xl border">
                                    <div className="border-border/60 grid grid-cols-2 gap-5 border-b px-4 py-3.5">
                                        <div>
                                            <div className="text-muted-foreground mb-0.5 text-[10.5px] font-bold tracking-wide uppercase">
                                                {t('contract_review_code')}
                                            </div>
                                            <div className="font-mono text-sm font-bold">{form.code || '—'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-muted-foreground mb-0.5 text-[10.5px] font-bold tracking-wide uppercase">
                                                {t('contract_review_name')}
                                            </div>
                                            <div className="text-sm font-semibold">{form.name || form.details || '—'}</div>
                                        </div>
                                    </div>
                                    <ReviewRow k={t('contract_label_type')} v={t(TYPE_META.find((m) => m.value === form.type)!.labelKey)} />
                                    <ReviewRow k={t('contract_vendor')} v={vendorOptions.find((o) => o.value === form.vendor_id)?.label || '—'} />
                                    <ReviewRow
                                        k={t('contract_review_term')}
                                        v={form.start_date && form.end_date ? `${form.start_date} → ${form.end_date}` : '—'}
                                        mono
                                    />
                                    <ReviewRow
                                        k={t('contract_value_per_cycle')}
                                        v={`${symbol}${form.value ? Number(form.value).toLocaleString() : '0'} (${t(`contract_billing_${form.billing_cycle}`)})`}
                                        mono
                                    />
                                    {form.total_value && (
                                        <ReviewRow k={t('contract_total_value')} v={`${symbol}${Number(form.total_value).toLocaleString()}`} mono />
                                    )}
                                    <ReviewRow
                                        k={t('contract_notify')}
                                        v={selectedNotify.length ? t('contract_days_many').replace('{n}', selectedNotify.join(', ')) : '—'}
                                    />
                                    {isHardware && (
                                        <ReviewRow
                                            k={t('contract_link_assets')}
                                            v={t('contract_review_assets_linked').replace('{n}', String(form.asset_ids.length))}
                                        />
                                    )}
                                    <ReviewRow
                                        k={t('contract_attachments')}
                                        v={t(attachmentCount === 1 ? 'contract_files_one' : 'contract_files_many').replace(
                                            '{n}',
                                            String(attachmentCount),
                                        )}
                                    />
                                </div>
                                {fileErr && <p className="text-destructive text-xs">{fileErr}</p>}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — Back / Next / Save */}
                <div className="border-border/60 bg-muted/30 flex items-center gap-3 border-t px-6 py-3.5">
                    <Button variant="outline" onClick={step === 0 ? onClose : goBack} disabled={saving}>
                        {step === 0 ? (
                            t('cancel')
                        ) : (
                            <>
                                <ChevronLeft className="h-4 w-4" />
                                {t('contract_back')}
                            </>
                        )}
                    </Button>

                    {/* Step dots */}
                    <div className="mx-auto flex gap-1.5">
                        {steps.map((_, i) => (
                            <span key={i} className={cn('h-1.5 rounded-full transition-all', i === step ? 'bg-brand w-5' : 'bg-border w-1.5')} />
                        ))}
                    </div>

                    {step < LAST_STEP ? (
                        <Button onClick={goNext}>
                            {t('contract_next')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={saving || saveState === 'done'}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {saving
                                ? t('contract_saving')
                                : saveState === 'done'
                                  ? t('contract_saved')
                                  : editing
                                    ? t('contract_save_changes')
                                    : t('save')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Per-step heading: small step number, bold title, muted subtitle. `title` / `sub` arrive already translated. */
function StepHead({ num, title, sub }: { num: number; title: string; sub: string }) {
    const t = useT();
    return (
        <div>
            <p className="text-brand text-xs font-bold tracking-wide uppercase">{t('contract_step_n').replace('{n}', String(num))}</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">{title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{sub}</p>
        </div>
    );
}

/** A single label/value row inside the review card (zebra-striped). */
function ReviewRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
    return (
        <div className="odd:bg-muted/30 flex justify-between gap-3 px-4 py-2 text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className={cn('text-right font-semibold', mono && 'font-mono')}>{v}</span>
        </div>
    );
}
