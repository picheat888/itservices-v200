import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { ContractDialogHeader } from '@/components/contracts/contract-dialog-header';
import { Dialog, DialogContent } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useContractMutations } from '@/hooks/use-contracts';
import { useVendors } from '@/hooks/use-master-data';
import { useCurrency } from '@/hooks/use-settings';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { assetApi } from '@/services/assetApi';
import { useUiStore } from '@/stores/ui';
import { type BillingCycle, type Contract, type ContractAttachment, type ContractType, type Vendor } from '@/shared/types';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Check, ChevronLeft, ChevronRight, Cog, FileText, Info, Laptop, Loader2, Package, Paperclip, Search, Wifi, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const MAX_FILES = 5;
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

/** Human-readable file size, e.g. "1.4 MB" / "820 KB". */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const TYPE_META: { value: ContractType; icon: typeof FileText; labelKey: string; subTh: string; subEn: string }[] = [
    { value: 'software', icon: FileText, labelKey: 'contract_type_software', subTh: 'License / SaaS', subEn: 'License / SaaS' },
    { value: 'hardware', icon: Laptop, labelKey: 'contract_type_hardware', subTh: 'เช่า / บำรุงรักษา', subEn: 'Lease / maintenance' },
    { value: 'service', icon: Cog, labelKey: 'contract_type_service', subTh: 'บริการ / สนับสนุน', subEn: 'Service / support' },
    { value: 'connectivity', icon: Wifi, labelKey: 'contract_type_connectivity', subTh: 'อินเทอร์เน็ต / วงจร', subEn: 'Internet / circuit' },
    { value: 'other', icon: Package, labelKey: 'contract_type_other', subTh: 'อื่น ๆ', subEn: 'Other' },
];

const REMINDER_DAYS = [150, 120, 90, 60, 45, 30, 7] as const;
type ReminderKey = 'notify_150' | 'notify_120' | 'notify_90' | 'notify_60' | 'notify_45' | 'notify_30' | 'notify_7';

const LAST_STEP = 5;
/** Required fields owned by each step — used to validate on "Next" and to jump to the first error on Save. */
const STEP_FIELDS: string[][] = [
    [], // 0 · type (always valid — has a default)
    ['code', 'title', 'vendor', 'name'], // 1 · contract info
    ['start_date', 'end_date', 'value'], // 2 · term & value
    ['notify'], // 3 · reminders
    [], // 4 · link assets (optional)
    [], // 5 · review
];
/** Maps an error field back to the step that owns it, so Save can jump there. */
const FIELD_STEP: Record<string, number> = {
    code: 1,
    title: 1,
    vendor: 1,
    name: 1,
    start_date: 2,
    end_date: 2,
    value: 2,
    notify: 3,
};

interface FormState {
    code: string;
    type: ContractType;
    vendor: string;
    title: string;
    name: string;
    start_date: string;
    end_date: string;
    value: string;
    billing_cycle: BillingCycle;
    auto_renew: boolean;
    notify_150: boolean;
    notify_120: boolean;
    notify_90: boolean;
    notify_60: boolean;
    notify_45: boolean;
    notify_30: boolean;
    notify_7: boolean;
    notes: string;
    /** Whether this contract links to assets — chosen via a switch, independent of contract type. */
    link_assets: boolean;
    asset_ids: number[];
}

const EMPTY: FormState = {
    code: '',
    type: 'software',
    vendor: '',
    title: '',
    name: '',
    start_date: '',
    end_date: '',
    value: '',
    billing_cycle: 'yearly',
    auto_renew: false,
    notify_150: false,
    notify_120: false,
    notify_90: false,
    notify_60: true,
    notify_45: false,
    notify_30: true,
    notify_7: true,
    notes: '',
    link_assets: false,
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
    const confirm = useConfirm();
    const { data: vendors = [] } = useVendors();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [step, setStep] = useState(0);

    // Attachments: already-saved files (with pending removals) + newly picked files
    // not yet uploaded. Both are applied when the form is saved.
    const [existing, setExisting] = useState<ContractAttachment[]>([]);
    const [removedIds, setRemovedIds] = useState<number[]>([]);
    const [pending, setPending] = useState<File[]>([]);
    const [fileErr, setFileErr] = useState('');

    const vendorOptions = useMemo(() => {
        // Value stays the canonical vendor name (what's stored on the contract);
        // only the label follows the active language so the Thai name surfaces.
        const opts = (vendors as Vendor[]).map((v) => ({
            value: v.name,
            label: lang === 'th' ? (v.name_th ?? v.name) : v.name,
            search: `${v.name} ${v.name_th ?? ''}`,
        }));
        // Keep existing vendor visible when editing a contract not yet in master data
        if (form.vendor && !opts.some((o) => o.value === form.vendor)) {
            opts.unshift({ value: form.vendor, label: form.vendor, search: form.vendor });
        }
        return opts;
    }, [vendors, form.vendor, lang]);
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
                vendor: editing.vendor,
                title: editing.title ?? '',
                name: editing.name,
                start_date: editing.start,
                end_date: editing.end,
                value: String(editing.value),
                billing_cycle: editing.billing_cycle,
                auto_renew: editing.auto_renew,
                notify_150: editing.notify_150,
                notify_120: editing.notify_120,
                notify_90: editing.notify_90,
                notify_60: editing.notify_60,
                notify_45: editing.notify_45,
                notify_30: editing.notify_30,
                notify_7: editing.notify_7,
                notes: editing.notes ?? '',
                link_assets: (editing.linked_assets?.length ?? 0) > 0,
                asset_ids: editing.linked_assets?.map((a) => a.id) ?? [],
            });
        } else {
            setForm(EMPTY);
        }
    }, [open, editing]);

    const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Toggling the link-assets switch: turning it ON asks for confirmation first
    // (saving will reassign the picked assets to this contract); turning OFF is immediate.
    const toggleLinkAssets = async (next: boolean) => {
        if (!next) {
            upd('link_assets', false);
            return;
        }
        const ok = await confirm({
            variant: 'warn',
            title: lang === 'th' ? 'ผูกทรัพย์สินกับสัญญานี้?' : 'Link assets to this contract?',
            description:
                lang === 'th'
                    ? 'เปิดเพื่อเลือกทรัพย์สินที่จะผูกกับสัญญานี้ — เมื่อบันทึก ระบบจะตั้งค่าสัญญาให้กับทรัพย์สินที่เลือก'
                    : 'This lets you pick assets to link. On save, the selected assets will be assigned to this contract.',
            confirmText: lang === 'th' ? 'ผูกทรัพย์สิน' : 'Link assets',
        });
        if (ok) upd('link_assets', true);
    };

    // Linked-assets picker: enabled when the user turns the "link assets" switch on (any type).
    const [assetSearch, setAssetSearch] = useState('');
    const { data: linkableAssets = [], isLoading: assetsLoading } = useQuery({
        queryKey: ['assets-linkable', editing?.id ?? 'new'],
        queryFn: () => assetApi.linkable(editing?.id),
        enabled: open && form.link_assets,
    });
    const filteredAssets = useMemo(() => {
        const q = assetSearch.trim().toLowerCase();
        if (!q) return linkableAssets;
        return linkableAssets.filter((a) => `${a.tag} ${a.name}`.toLowerCase().includes(q));
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
        const required = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
        if (!form.code.trim()) e.code = required;
        if (!form.vendor.trim()) e.vendor = required;
        if (!form.title.trim()) e.title = required;
        if (!form.name.trim()) e.name = required;
        if (!form.start_date) e.start_date = required;
        if (!form.end_date) e.end_date = required;
        if (!form.value.trim()) e.value = required;
        if (form.start_date && form.end_date && form.end_date < form.start_date) {
            e.end_date = lang === 'th' ? 'ต้องไม่ก่อนวันเริ่ม' : 'Must be after start';
        }
        if (!REMINDER_DAYS.some((d) => form[`notify_${d}` as ReminderKey])) {
            e.notify = lang === 'th' ? 'เลือกอย่างน้อย 1 ช่วง' : 'Select at least one';
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
            vendor: form.vendor.trim(),
            title: form.title.trim(),
            name: form.name.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            value: Number(form.value),
            billing_cycle: form.billing_cycle,
            auto_renew: form.auto_renew,
            notify_150: form.notify_150,
            notify_120: form.notify_120,
            notify_90: form.notify_90,
            notify_60: form.notify_60,
            notify_45: form.notify_45,
            notify_30: form.notify_30,
            notify_7: form.notify_7,
            notes: form.notes.trim() || null,
            // Send the current selection when linking is on; clear links when the switch is off.
            asset_ids: form.link_assets ? form.asset_ids : [],
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

    // Step metadata for the horizontal stepper.
    const steps = [
        { th: 'ประเภท', en: 'Type' },
        { th: 'ข้อมูลสัญญา', en: 'Details' },
        { th: 'ระยะเวลา & มูลค่า', en: 'Term & value' },
        { th: 'แจ้งเตือน', en: 'Reminders' },
        { th: 'เชื่อมโยงทรัพย์สิน', en: 'Link assets' },
        { th: 'ตรวจสอบ', en: 'Review' },
    ];

    const TypeIcon = TYPE_META.find((m) => m.value === form.type)?.icon ?? FileText;
    const selectedNotify = REMINDER_DAYS.filter((d) => form[`notify_${d}` as ReminderKey]);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="!flex h-[min(860px,calc(100vh-72px))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
                {/* Header */}
                <ContractDialogHeader
                    icon={TypeIcon}
                    eyebrow={editing ? (lang === 'th' ? 'แก้ไขสัญญา' : 'Edit contract') : lang === 'th' ? 'สัญญาใหม่' : 'New contract'}
                    title={editing ? (lang === 'th' ? 'แก้ไขสัญญา' : 'Edit contract') : t('new_contract')}
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
                                    {lang === 'th' ? s.th : s.en}
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
                                <p className="text-brand mb-1 text-xs font-bold tracking-wide uppercase">{lang === 'th' ? 'ขั้นที่ 1' : 'Step 1'}</p>
                                <h2 className="text-xl font-extrabold tracking-tight">{lang === 'th' ? 'ประเภทสัญญา' : 'Contract type'}</h2>
                                <p className="text-muted-foreground mt-1 mb-6 text-sm">
                                    {lang === 'th'
                                        ? 'เลือกหมวดหมู่ เพื่อให้ระบบแสดงเฉพาะฟิลด์ที่จำเป็น'
                                        : 'Pick a category so the form shows only what matters.'}
                                </p>
                                <div className="grid grid-cols-5 gap-3">
                                    {TYPE_META.map((tp) => {
                                        const Icon = tp.icon;
                                        const sel = form.type === tp.value;
                                        return (
                                            <button
                                                type="button"
                                                key={tp.value}
                                                onClick={() => upd('type', tp.value)}
                                                className={cn(
                                                    'flex flex-col items-center gap-2.5 rounded-xl border p-5 text-center transition-colors',
                                                    sel
                                                        ? 'border-brand bg-brand/5 text-brand shadow-[inset_0_0_0_1px_var(--brand)]'
                                                        : 'border-border hover:bg-accent',
                                                )}
                                            >
                                                <Icon className="h-6 w-6" />
                                                <span className="text-[13px] leading-tight font-semibold">
                                                    {t(tp.labelKey)}
                                                    <span className="text-muted-foreground mt-0.5 block text-[11px] font-medium">
                                                        {lang === 'th' ? tp.subTh : tp.subEn}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Step 2 · Contract info (+ attachments) ───── */}
                        {step === 1 && (
                            <div className="mx-auto w-full max-w-[860px] space-y-6">
                                <StepHead
                                    lang={lang}
                                    num={2}
                                    thTitle="ข้อมูลสัญญา"
                                    enTitle="Contract details"
                                    thSub="ระบุรหัสอ้างอิง หัวข้อ ผู้จำหน่าย ชื่อรายการ และแนบเอกสารสัญญา"
                                    enSub="Reference code, title, vendor, item name, and attach the contract file."
                                />

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

                                        <Field label={t('contract_title')} required error={err.title} name="title">
                                            <Input
                                                value={form.title}
                                                onChange={(e) => upd('title', e.target.value)}
                                                placeholder={
                                                    lang === 'th' ? 'เช่น สัญญาเช่าเครื่องพิมพ์ประจำปี' : 'e.g. Annual printer lease agreement'
                                                }
                                            />
                                        </Field>

                                        <Field label={t('contract_vendor')} required error={err.vendor} name="vendor">
                                            <SearchableSelect
                                                value={form.vendor}
                                                onChange={(v) => upd('vendor', v)}
                                                options={vendorOptions}
                                                placeholder={lang === 'th' ? 'เลือกผู้จำหน่าย' : 'Select vendor'}
                                            />
                                        </Field>

                                        <Field label={t('contract_name')} required error={err.name} name="name">
                                            <Input
                                                value={form.name}
                                                onChange={(e) => upd('name', e.target.value)}
                                                placeholder={lang === 'th' ? 'เช่น Microsoft 365 — 320 สิทธิ์' : 'e.g. Microsoft 365 — 320 seats'}
                                            />
                                        </Field>

                                        <Field label={lang === 'th' ? 'หมายเหตุ' : 'Notes'}>
                                            <textarea
                                                value={form.notes}
                                                onChange={(e) => upd('notes', e.target.value)}
                                                rows={3}
                                                placeholder={lang === 'th' ? 'รายละเอียดเพิ่มเติม (ถ้ามี)' : 'Additional notes (optional)'}
                                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
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
                                                <label className="border-input text-muted-foreground hover:bg-accent hover:text-brand flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-sm">
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
                                <StepHead
                                    lang={lang}
                                    num={3}
                                    thTitle="ระยะเวลาและมูลค่า"
                                    enTitle="Term & value"
                                    thSub="กำหนดวันเริ่ม–สิ้นสุด มูลค่า และรอบการเรียกเก็บ"
                                    enSub="Set the start/end dates, value, and billing cycle."
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={t('contract_start')} required error={err.start_date} name="start_date">
                                        <div className="relative">
                                            <Input
                                                type="date"
                                                className="pr-9 font-mono [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                value={form.start_date}
                                                onChange={(e) => upd('start_date', e.target.value)}
                                            />
                                            <Calendar className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                                        </div>
                                    </Field>
                                    <Field label={t('contract_end')} required error={err.end_date} name="end_date">
                                        <div className="relative">
                                            <Input
                                                type="date"
                                                className="pr-9 font-mono [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                                value={form.end_date}
                                                onChange={(e) => upd('end_date', e.target.value)}
                                            />
                                            <Calendar className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                                        </div>
                                    </Field>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <Field label={`${t('contract_value')} (${symbol})`} required error={err.value} name="value">
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            className="font-mono"
                                            value={form.value ? Number(form.value).toLocaleString() : ''}
                                            onChange={(e) => upd('value', e.target.value.replace(/[^\d]/g, ''))}
                                            placeholder="2,140,000"
                                        />
                                    </Field>
                                    <Field label={t('contract_billing')}>
                                        <select
                                            value={form.billing_cycle}
                                            onChange={(e) => upd('billing_cycle', e.target.value as BillingCycle)}
                                            className="border-input bg-background focus:border-brand h-10 w-full rounded-md border px-3 text-sm outline-none"
                                        >
                                            <option value="monthly">{t('contract_billing_monthly')}</option>
                                            <option value="quarterly">{t('contract_billing_quarterly')}</option>
                                            <option value="yearly">{t('contract_billing_yearly')}</option>
                                        </select>
                                    </Field>
                                </div>

                                <Field label={t('contract_auto_renew')}>
                                    <label className="flex h-10 items-center gap-3 text-sm">
                                        <button
                                            type="button"
                                            onClick={() => upd('auto_renew', !form.auto_renew)}
                                            className={cn(
                                                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                                                form.auto_renew ? 'bg-brand' : 'bg-muted',
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
                                                    form.auto_renew ? 'left-[1.125rem]' : 'left-0.5',
                                                )}
                                            />
                                        </button>
                                        <span className="text-muted-foreground">
                                            {form.auto_renew
                                                ? lang === 'th'
                                                    ? 'ต่ออายุอัตโนมัติ'
                                                    : 'Will renew automatically'
                                                : lang === 'th'
                                                  ? 'ต้องต่ออายุด้วยตนเอง'
                                                  : 'Manual renewal required'}
                                        </span>
                                    </label>
                                </Field>
                            </div>
                        )}

                        {/* ── Step 4 · Reminders ──────────────────────── */}
                        {step === 3 && (
                            <div className="mx-auto w-full max-w-[560px] space-y-5">
                                <StepHead
                                    lang={lang}
                                    num={4}
                                    thTitle="แจ้งเตือนก่อนหมดอายุ"
                                    enTitle="Expiry reminders"
                                    thSub="เลือกอย่างน้อย 1 ช่วง ระบบจะส่งอีเมลและแจ้งเตือนในระบบ"
                                    enSub="Pick at least one window. We'll email and notify you in-app."
                                />
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
                                                    {d} {lang === 'th' ? 'วัน' : 'days'}
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
                                <div className="flex items-start justify-between gap-4">
                                    <StepHead
                                        lang={lang}
                                        num={5}
                                        thTitle="เชื่อมโยงทรัพย์สิน"
                                        enTitle="Link assets"
                                        thSub="เปิดสวิตช์เพื่อผูกสัญญานี้กับทรัพย์สินที่เกี่ยวข้อง"
                                        enSub="Turn on the switch to link this contract to related assets."
                                    />
                                    <label className="flex shrink-0 cursor-pointer items-center gap-2.5 pt-1">
                                        <span className="text-muted-foreground text-sm font-medium">
                                            {lang === 'th' ? 'ผูกทรัพย์สิน' : 'Link assets'}
                                        </span>
                                        <Switch
                                            checked={form.link_assets}
                                            onChange={toggleLinkAssets}
                                            aria-label={lang === 'th' ? 'ผูกทรัพย์สิน' : 'Link assets'}
                                        />
                                    </label>
                                </div>

                                {!form.link_assets ? (
                                    <div className="border-input bg-muted/40 text-muted-foreground flex items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm">
                                        <Info className="h-4 w-4 shrink-0" />
                                        {lang === 'th'
                                            ? 'ยังไม่ได้ผูกทรัพย์สิน — เปิดสวิตช์ด้านบนเพื่อเลือก'
                                            : 'No assets linked — turn on the switch above to choose.'}
                                    </div>
                                ) : (
                                    <Field label={t('contract_link_assets')} help={t('contract_link_assets_sub')}>
                                        <div className="border-border overflow-hidden rounded-md border">
                                            <div className="border-border relative border-b">
                                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                                <Input
                                                    value={assetSearch}
                                                    onChange={(e) => setAssetSearch(e.target.value)}
                                                    placeholder={lang === 'th' ? 'ค้นหา tag / ชื่อ' : 'Search tag / name'}
                                                    className="border-0 pl-9 focus-visible:ring-0"
                                                />
                                            </div>
                                            <div className="max-h-72 overflow-auto">
                                                {assetsLoading ? (
                                                    <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                                                        {lang === 'th' ? 'กำลังโหลด…' : 'Loading…'}
                                                    </div>
                                                ) : filteredAssets.length === 0 ? (
                                                    <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                                                        {lang === 'th' ? 'ไม่มี asset ให้เลือก' : 'No assets available'}
                                                    </div>
                                                ) : (
                                                    filteredAssets.map((a) => {
                                                        const checked = form.asset_ids.includes(a.id);
                                                        return (
                                                            <button
                                                                key={a.id}
                                                                type="button"
                                                                onClick={() => toggleAsset(a.id)}
                                                                className="border-border/60 hover:bg-accent/40 flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-0"
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                                                        checked ? 'border-brand bg-brand text-white' : 'border-input',
                                                                    )}
                                                                >
                                                                    {checked && <Check className="h-3 w-3" />}
                                                                </span>
                                                                <span className="font-mono text-xs">{a.tag}</span>
                                                                <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                                                                <span className="text-muted-foreground shrink-0 text-[11px]">
                                                                    {a.status.replace(/_/g, ' ')}
                                                                </span>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                            <div className="border-border text-muted-foreground border-t px-3 py-1.5 text-xs">
                                                {lang === 'th' ? `เลือกแล้ว ${form.asset_ids.length} รายการ` : `${form.asset_ids.length} selected`}
                                            </div>
                                        </div>
                                    </Field>
                                )}
                            </div>
                        )}

                        {/* ── Step 6 · Review ─────────────────────────── */}
                        {step === 5 && (
                            <div className="mx-auto w-full max-w-[640px] space-y-5">
                                <StepHead
                                    lang={lang}
                                    num={6}
                                    thTitle="ตรวจสอบก่อนบันทึก"
                                    enTitle="Review before saving"
                                    thSub="ตรวจสอบความถูกต้อง แก้ไขขั้นใดก็ได้จากแถบด้านบน"
                                    enSub="Double-check the details — jump to any step from the bar above."
                                />

                                <div className="border-border overflow-hidden rounded-xl border">
                                    <div className="border-border/60 grid grid-cols-2 gap-5 border-b px-4 py-3.5">
                                        <div>
                                            <div className="text-muted-foreground mb-0.5 text-[10.5px] font-bold tracking-wide uppercase">
                                                Contract No
                                            </div>
                                            <div className="font-mono text-sm font-bold">{form.code || '—'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-muted-foreground mb-0.5 text-[10.5px] font-bold tracking-wide uppercase">
                                                Contract name
                                            </div>
                                            <div className="text-sm font-semibold">{form.name || form.title || '—'}</div>
                                        </div>
                                    </div>
                                    <ReviewRow k={lang === 'th' ? 'ประเภท' : 'Type'} v={t(TYPE_META.find((m) => m.value === form.type)!.labelKey)} />
                                    <ReviewRow k={t('contract_vendor')} v={form.vendor || '—'} />
                                    <ReviewRow
                                        k={lang === 'th' ? 'ระยะเวลา' : 'Term'}
                                        v={form.start_date && form.end_date ? `${form.start_date} → ${form.end_date}` : '—'}
                                        mono
                                    />
                                    <ReviewRow
                                        k={t('contract_value')}
                                        v={`${symbol}${form.value ? Number(form.value).toLocaleString() : '0'} · ${t(`contract_billing_${form.billing_cycle}`)}`}
                                        mono
                                    />
                                    <ReviewRow
                                        k={t('contract_auto_renew')}
                                        v={form.auto_renew ? (lang === 'th' ? 'ใช่' : 'Yes') : lang === 'th' ? 'ไม่' : 'No'}
                                    />
                                    <ReviewRow
                                        k={t('contract_notify')}
                                        v={selectedNotify.length ? `${selectedNotify.join(' · ')} ${lang === 'th' ? 'วัน' : 'days'}` : '—'}
                                    />
                                    {form.link_assets && (
                                        <ReviewRow
                                            k={t('contract_link_assets')}
                                            v={lang === 'th' ? `${form.asset_ids.length} รายการ` : `${form.asset_ids.length} linked`}
                                        />
                                    )}
                                    <ReviewRow
                                        k={t('contract_attachments')}
                                        v={
                                            lang === 'th'
                                                ? `${visibleExisting.length + pending.length} ไฟล์`
                                                : `${visibleExisting.length + pending.length} files`
                                        }
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
                                {lang === 'th' ? 'ย้อนกลับ' : 'Back'}
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
                            {lang === 'th' ? 'ถัดไป' : 'Next'}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button onClick={submit} disabled={saving || saveState === 'done'}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {saving
                                ? lang === 'th'
                                    ? 'กำลังบันทึก…'
                                    : 'Saving…'
                                : saveState === 'done'
                                  ? lang === 'th'
                                      ? 'บันทึกแล้ว'
                                      : 'Saved!'
                                  : editing
                                    ? lang === 'th'
                                        ? 'บันทึกการแก้ไข'
                                        : 'Save changes'
                                    : t('save')}
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

/** Per-step heading: small step number, bold title, muted subtitle. */
function StepHead({
    lang,
    num,
    thTitle,
    enTitle,
    thSub,
    enSub,
}: {
    lang: string;
    num: number;
    thTitle: string;
    enTitle: string;
    thSub: string;
    enSub: string;
}) {
    return (
        <div>
            <p className="text-brand text-xs font-bold tracking-wide uppercase">{lang === 'th' ? `ขั้นที่ ${num}` : `Step ${num}`}</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">{lang === 'th' ? thTitle : enTitle}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{lang === 'th' ? thSub : enSub}</p>
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
