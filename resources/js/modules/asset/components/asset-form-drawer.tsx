import { useT } from '@/lang';
import { useAssetModels, useBrands, useCategories, useCurrency, useVendors, useWarehouses } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import type { Asset, AssetSource } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { ChoiceCard } from '@/shared/ui/choice-card';
import { DateInput } from '@/shared/ui/date-input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';
import { useUiStore } from '@/stores/ui';
import { Check, FileText, Infinity as InfinityIcon, Loader2, PackagePlus, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AssetPayload } from '../api/assetApi';
import { useAssetContractOptions, useAssetMutations } from '../hooks/use-assets';

interface FormState {
    category_id: string;
    source: AssetSource;
    model_id: string;
    brand_id: string;
    serial: string;
    tag: string;
    warehouse_id: string;
    value: string;
    vendor_id: string;
    purchase_date: string;
    warranty_end: string;
    warranty_lifetime: boolean;
    contract_id: string;
    notes: string;
}

const EMPTY: FormState = {
    category_id: '',
    source: 'purchased',
    model_id: '',
    brand_id: '',
    serial: '',
    tag: '',
    warehouse_id: '',
    value: '',
    vendor_id: '',
    purchase_date: '',
    warranty_end: '',
    warranty_lifetime: false,
    contract_id: '',
    notes: '',
};

/** Small uppercase section heading (mirrors the View Details dialog). */
function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="text-muted-foreground mb-2 text-sm font-bold tracking-wide uppercase">{children}</div>;
}

/**
 * Centered focus dialog for registering a new asset or editing an existing one.
 * Registration only records the asset (it enters the pool as Ready) — ownership is
 * assigned later through Transfer. Rented assets derive fee / vendor / lease period
 * from their linked contract, so only the contract is picked here.
 */
export function AssetFormDrawer({ open, editing, onClose }: { open: boolean; editing: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { symbol } = useCurrency();
    const { create, update } = useAssetMutations();
    const { data: warehouses = [] } = useWarehouses();
    const { data: brands = [] } = useBrands();
    const { data: models = [] } = useAssetModels();
    const { data: categories = [] } = useCategories();
    const { data: vendors = [] } = useVendors();
    const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: String(w.id), label: w.name, search: w.name })), [warehouses]);
    const brandOptions = useMemo(() => brands.map((b) => ({ value: String(b.id), label: b.name, search: b.name })), [brands]);
    const vendorOptions = useMemo(() => vendors.map((v) => ({ value: String(v.id), label: v.name, search: v.name })), [vendors]);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [initial, setInitial] = useState<FormState>(EMPTY);
    const [err, setErr] = useState<Record<string, string>>({});
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');

    useEffect(() => {
        if (!open) return;
        setErr({});
        setSaveState('idle');
        const next: FormState = editing
            ? {
                  category_id: editing.category_id ? String(editing.category_id) : '',
                  source: editing.source,
                  model_id: editing.model_id ? String(editing.model_id) : '',
                  brand_id: editing.brand_id ? String(editing.brand_id) : '',
                  serial: editing.serial ?? '',
                  tag: editing.tag ?? '',
                  warehouse_id: editing.warehouse_id ? String(editing.warehouse_id) : '',
                  value: String(editing.value ?? ''),
                  vendor_id: editing.vendor_id ? String(editing.vendor_id) : '',
                  purchase_date: editing.purchase_date ?? '',
                  warranty_end: editing.warranty_end ?? '',
                  warranty_lifetime: editing.warranty_lifetime ?? false,
                  contract_id: editing.contract_id ? String(editing.contract_id) : '',
                  notes: editing.notes ?? '',
              }
            : EMPTY;
        setForm(next);
        // Snapshot the initial values so the Save button can stay disabled until the user
        // actually changes something (edit mode only — a new asset is always "dirty").
        setInitial(next);
    }, [open, editing]);

    const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
    const rented = form.source === 'rented';
    // In edit mode, disable Save until the form differs from the loaded asset.
    const isDirty = JSON.stringify(form) !== JSON.stringify(initial);
    // A warehouse only applies while the asset sits in the pool: on registration (it enters as
    // Ready) or when editing a Ready asset. Once deployed/pending it has left the pool and its
    // location is driven by transfer/receive — so the field is neither shown nor required there.
    const warehouseApplies = !editing || editing.status === 'ready';

    // Asset type, brand and model are all picked from the shared Master Data lists.
    const typeOptions = useMemo(
        () =>
            categories.map((c) => ({
                value: String(c.id),
                label: lang === 'th' ? (c.name_th ?? c.name) : c.name,
                search: `${c.name} ${c.name_th ?? ''}`,
            })),
        [categories, lang],
    );
    // Models are scoped to the chosen brand; with no brand picked, show them all.
    const selectedBrand = brands.find((b) => b.id === Number(form.brand_id));
    const modelOptions = useMemo(() => {
        const list = selectedBrand ? models.filter((m) => m.brand_id === selectedBrand.id) : models;
        return list.map((m) => ({ value: String(m.id), label: m.name, search: m.name }));
    }, [models, selectedBrand]);

    // Contracts to choose from when linking a rented asset to its vendor contract.
    // Uses the asset-scoped endpoint (gated by assets.register/edit), so an asset admin
    // without contracts.view still gets the picker. Fetched only while the drawer is open.
    const { data: contracts = [] } = useAssetContractOptions(open);
    const contractOptions = useMemo(
        () =>
            contracts.map((c) => ({
                value: String(c.id),
                label: `${c.code} — ${c.vendor ?? ''}`,
                search: `${c.code} ${c.vendor ?? ''} ${c.details ?? ''}`,
            })),
        [contracts],
    );

    const submit = async () => {
        const e: Record<string, string> = {};
        const required = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
        // Everything is required except Notes.
        if (!form.category_id) e.type = required;
        if (!form.brand_id) e.brand = required;
        if (!form.model_id) e.model = required;
        if (!form.serial.trim()) e.serial = required;
        if (warehouseApplies && !form.warehouse_id) e.warehouse = required;
        if (rented) {
            if (!form.contract_id) e.contract_id = required;
        } else {
            if (!form.value.trim()) e.value = required;
            if (!form.vendor_id) e.supplier = required;
            if (!form.purchase_date) e.purchase_date = required;
            if (!form.warranty_lifetime && !form.warranty_end) e.warranty_end = required;
        }
        setErr(e);
        if (Object.keys(e).length) return;

        // Shared fields; acquisition fields differ by source (rented ones are derived server-side).
        const payload: AssetPayload = {
            category_id: Number(form.category_id),
            source: form.source,
            model_id: Number(form.model_id),
            brand_id: form.brand_id ? Number(form.brand_id) : null,
            serial: form.serial.trim() || null,
            tag: form.tag.trim() || null,
            warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
            notes: form.notes.trim() || null,
            ...(rented
                ? { contract_id: form.contract_id ? Number(form.contract_id) : null }
                : {
                      value: Number(form.value),
                      vendor_id: form.vendor_id ? Number(form.vendor_id) : null,
                      purchase_date: form.purchase_date || null,
                      warranty_end: form.warranty_lifetime ? null : form.warranty_end || null,
                      warranty_lifetime: form.warranty_lifetime,
                      contract_id: null,
                  }),
        };

        try {
            if (editing) await update.mutateAsync({ id: editing.id, payload });
            else await create.mutateAsync(payload);
            setSaveState('done');
            setTimeout(() => {
                setSaveState('idle');
                onClose();
            }, 600);
        } catch {
            setErr({ model: lang === 'th' ? 'บันทึกไม่สำเร็จ' : 'Could not save' });
        }
    };

    const saving = create.isPending || update.isPending;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            {/* Fixed height + centered: same size for rented & purchased, and tall enough that the
                (taller) purchased form shows in full on desktop without an inner scroll. Caps at 92vh
                on short viewports so it never spills off-screen. */}
            <DialogContent className="!flex h-[min(880px,92vh)] w-full max-w-[880px] flex-col gap-0 overflow-hidden p-0">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 pt-4 pb-3">
                    <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                        <PackagePlus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">
                            {lang === 'th' ? 'ทรัพย์สิน' : 'Asset'}
                        </div>
                        <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                            <span>{editing ? t('edit_asset') : t('register_asset')}</span>
                            {editing && (
                                <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">
                                    {editing.asset_code}
                                </span>
                            )}
                        </DialogTitle>
                    </div>
                    <DialogDescription className="sr-only">{t('assets_sub')}</DialogDescription>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    {/* Asset nature — purchased vs rented */}
                    <div>
                        <SectionLabel>{t('asset_nature')}</SectionLabel>
                        <div className="grid grid-cols-2 gap-3">
                            {(['purchased', 'rented'] as AssetSource[]).map((s) => {
                                const on = form.source === s;
                                return (
                                    <ChoiceCard
                                        key={s}
                                        selected={on}
                                        onClick={() => upd('source', s)}
                                        className="flex items-start gap-3 rounded-xl p-3 text-left"
                                    >
                                        <span
                                            className={cn(
                                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                                on ? 'bg-brand/10 text-brand' : 'bg-accent text-muted-foreground',
                                            )}
                                        >
                                            {s === 'rented' ? <FileText className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                                        </span>
                                        <span className="min-w-0">
                                            <span className={cn('block text-sm font-bold', on ? 'text-brand' : 'text-foreground')}>
                                                {s === 'rented' ? t('asset_lease') : t('asset_purchase')}
                                            </span>
                                            <span className="text-muted-foreground mt-0.5 block text-[11px]">
                                                {s === 'rented' ? t('asset_source_rented_sub') : t('asset_source_purchased_sub')}
                                            </span>
                                        </span>
                                    </ChoiceCard>
                                );
                            })}
                        </div>
                    </div>

                    {/* General — identity + acquisition, all general asset info */}
                    <div>
                        <SectionLabel>{t('asset_general')}</SectionLabel>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t('asset_type')} required error={err.type} name="type">
                                    <SearchableSelect
                                        value={form.category_id}
                                        onChange={(v) => upd('category_id', v)}
                                        options={typeOptions}
                                        placeholder={lang === 'th' ? 'เลือกประเภท' : 'Select type'}
                                    />
                                </Field>
                                <Field label={t('asset_brand')} required error={err.brand} name="brand">
                                    <SearchableSelect
                                        value={form.brand_id}
                                        onChange={(v) => setForm((f) => ({ ...f, brand_id: v, model_id: '' }))}
                                        options={brandOptions}
                                        placeholder={lang === 'th' ? 'เลือกยี่ห้อ' : 'Select brand'}
                                    />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t('asset_model')} required error={err.model} name="model">
                                    <SearchableSelect
                                        value={form.model_id}
                                        onChange={(v) => upd('model_id', v)}
                                        options={modelOptions}
                                        placeholder={lang === 'th' ? 'เลือกรุ่น' : 'Select model'}
                                    />
                                </Field>
                                <Field label={t('asset_serial')} required error={err.serial} name="serial">
                                    <Input
                                        value={form.serial}
                                        onChange={(e) => upd('serial', e.target.value)}
                                        className="font-mono"
                                        placeholder="SN-XXXXXXXX"
                                    />
                                </Field>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {warehouseApplies ? (
                                    <Field label={t('asset_warehouse')} required error={err.warehouse} name="warehouse">
                                        <SearchableSelect
                                            value={form.warehouse_id}
                                            onChange={(v) => upd('warehouse_id', v)}
                                            options={warehouseOptions}
                                            placeholder={lang === 'th' ? 'เลือกคลัง' : 'Select warehouse'}
                                            clearable
                                        />
                                    </Field>
                                ) : (
                                    // Deployed / pending asset: it's out of the pool, so warehouse doesn't apply here.
                                    <Field label={t('asset_warehouse')}>
                                        <div className="border-input bg-muted/40 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm">
                                            {t('asset_warehouse_na')}
                                        </div>
                                    </Field>
                                )}
                                <Field label={t('asset_nickname')} help={t('asset_nickname_help')}>
                                    <Input
                                        value={form.tag}
                                        onChange={(e) => upd('tag', e.target.value)}
                                        placeholder={lang === 'th' ? 'เช่น เครื่องพี่สมชาย' : 'e.g. Reception PC'}
                                    />
                                </Field>
                            </div>

                            {/* Acquisition fields (no separate heading — general asset info) */}
                            {rented ? (
                                <div className="space-y-3">
                                    <Field label={t('asset_linked_contract')} required error={err.contract_id} name="contract_id">
                                        <SearchableSelect
                                            value={form.contract_id}
                                            onChange={(v) => upd('contract_id', v)}
                                            options={contractOptions}
                                            placeholder={lang === 'th' ? 'เลือกสัญญาเช่า' : 'Select lease contract'}
                                        />
                                    </Field>
                                    <p className="text-muted-foreground text-xs leading-relaxed">{t('asset_rented_from_contract')}</p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label={`${t('asset_purchase_price')} (${symbol})`} required error={err.value} name="value">
                                            <Input
                                                inputMode="numeric"
                                                className="font-mono"
                                                value={form.value ? Number(form.value).toLocaleString() : ''}
                                                onChange={(e) => upd('value', e.target.value.replace(/[^\d]/g, ''))}
                                                placeholder="0"
                                            />
                                        </Field>
                                        <Field label={t('asset_supplier')} required error={err.supplier} name="supplier">
                                            <SearchableSelect
                                                value={form.vendor_id}
                                                onChange={(v) => upd('vendor_id', v)}
                                                options={vendorOptions}
                                                placeholder={lang === 'th' ? 'เลือกผู้ขาย' : 'Select supplier'}
                                            />
                                        </Field>
                                    </div>
                                    {/* Purchase date + warranty end — both label rows are h-5 so the date inputs line up
                                        even though the warranty row carries the lifetime switch. */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5" data-field="purchase_date">
                                            <div className="flex h-5 items-center">
                                                <Label>
                                                    {t('asset_purchase_date')}
                                                    <span className="text-destructive ml-0.5">*</span>
                                                </Label>
                                            </div>
                                            <DateInput value={form.purchase_date} onChange={(v) => upd('purchase_date', v)} />
                                            {err.purchase_date && <p className="text-destructive text-xs">{err.purchase_date}</p>}
                                        </div>
                                        <div className="space-y-1.5" data-field="warranty_end">
                                            <div className="flex h-5 items-center justify-between">
                                                <Label>
                                                    {t('asset_warranty_end')}
                                                    {!form.warranty_lifetime && <span className="text-destructive ml-0.5">*</span>}
                                                </Label>
                                                {/* Label + switch are siblings (not a button-in-button, which is invalid HTML). */}
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => upd('warranty_lifetime', !form.warranty_lifetime)}
                                                        className={cn(
                                                            'text-[11px] font-semibold',
                                                            form.warranty_lifetime ? 'text-brand' : 'text-muted-foreground',
                                                        )}
                                                    >
                                                        {t('asset_lifetime')}
                                                    </button>
                                                    <Switch
                                                        checked={form.warranty_lifetime}
                                                        onChange={(v) => upd('warranty_lifetime', v)}
                                                        aria-label={t('asset_warranty_lifetime')}
                                                    />
                                                </div>
                                            </div>
                                            {form.warranty_lifetime ? (
                                                <div className="flex h-10 items-center gap-2 rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 px-3 text-sm font-medium text-amber-700 dark:text-amber-400">
                                                    <InfinityIcon className="h-4 w-4" />
                                                    {t('asset_warranty_lifetime')}
                                                </div>
                                            ) : (
                                                <DateInput value={form.warranty_end} onChange={(v) => upd('warranty_end', v)} />
                                            )}
                                            {err.warranty_end && <p className="text-destructive text-xs">{err.warranty_end}</p>}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <SectionLabel>{t('asset_notes')}</SectionLabel>
                        <Textarea value={form.notes} onChange={(e) => upd('notes', e.target.value)} rows={2} />
                    </div>
                </div>

                {/* Footer */}
                <div className="border-border/60 bg-muted/30 flex items-center gap-2 border-t px-6 py-3">
                    <span className="text-muted-foreground mr-auto text-xs">
                        <span className="text-destructive">*</span> {lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required'}
                    </span>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={saving || saveState === 'done' || (!!editing && !isDirty)}>
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
                                ? t('save')
                                : t('register')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
