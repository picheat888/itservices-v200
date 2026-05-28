import { ASSET_TYPES } from '@/components/assets/asset-meta';
import { Field } from '@/components/shared/field';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssetMutations } from '@/hooks/use-assets';
import { useContracts } from '@/hooks/use-contracts';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/ui';
import type { Asset, AssetSource, AssetType } from '@/types';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface FormState {
    type: AssetType;
    source: AssetSource;
    model: string;
    brand: string;
    serial: string;
    owner: string;
    department: string;
    location: string;
    value: string;
    supplier: string;
    purchase_date: string;
    warranty_end: string;
    lease_start: string;
    lease_end: string;
    contract_id: string;
    notes: string;
}

const EMPTY: FormState = {
    type: 'laptop',
    source: 'purchased',
    model: '',
    brand: '',
    serial: '',
    owner: '',
    department: '',
    location: '',
    value: '',
    supplier: '',
    purchase_date: '',
    warranty_end: '',
    lease_start: '',
    lease_end: '',
    contract_id: '',
    notes: '',
};

/** Drawer used for both registering a new asset and editing an existing one. */
export function AssetFormDrawer({ open, editing, onClose }: { open: boolean; editing: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { create, update } = useAssetMutations();
    const [form, setForm] = useState<FormState>(EMPTY);
    const [err, setErr] = useState<Record<string, string>>({});
    const [saveState, setSaveState] = useState<'idle' | 'done'>('idle');

    useEffect(() => {
        if (!open) return;
        setErr({});
        setSaveState('idle');
        if (editing) {
            setForm({
                type: editing.type,
                source: editing.source,
                model: editing.model,
                brand: editing.brand ?? '',
                serial: editing.serial ?? '',
                owner: editing.owner ?? '',
                department: editing.department ?? '',
                location: editing.location ?? '',
                value: String(editing.value ?? ''),
                supplier: editing.supplier ?? '',
                purchase_date: editing.purchase_date ?? '',
                warranty_end: editing.warranty_end ?? '',
                lease_start: editing.lease_start ?? '',
                lease_end: editing.lease_end ?? '',
                contract_id: editing.contract_id ? String(editing.contract_id) : '',
                notes: editing.notes ?? '',
            });
        } else {
            setForm(EMPTY);
        }
    }, [open, editing]);

    const upd = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
    const rented = form.source === 'rented';

    // Contracts to choose from when linking a rented asset to its vendor contract.
    const { data: contractData } = useContracts({ page: 1, per_page: 100, search: '', tab: 'all' });
    const contractOptions = useMemo(
        () =>
            (contractData?.data ?? []).map((c) => ({
                value: String(c.id),
                label: `${c.code} — ${c.vendor}`,
                search: `${c.code} ${c.vendor} ${c.title ?? ''}`,
            })),
        [contractData],
    );

    const submit = async () => {
        const e: Record<string, string> = {};
        const required = lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required';
        if (!form.model.trim()) e.model = required;
        if (!form.value.trim()) e.value = required;
        setErr(e);
        if (Object.keys(e).length) return;

        const payload = {
            type: form.type,
            source: form.source,
            model: form.model.trim(),
            brand: form.brand.trim() || null,
            serial: form.serial.trim() || null,
            owner: form.owner.trim() || null,
            department: form.department.trim() || null,
            location: form.location.trim() || null,
            value: Number(form.value),
            supplier: form.supplier.trim() || null,
            purchase_date: rented ? null : form.purchase_date || null,
            warranty_end: rented ? null : form.warranty_end || null,
            lease_start: rented ? form.lease_start || null : null,
            lease_end: rented ? form.lease_end || null : null,
            contract_id: rented && form.contract_id ? Number(form.contract_id) : null,
            notes: form.notes.trim() || null,
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
    const dateInput = 'font-mono pr-3 [&::-webkit-calendar-picker-indicator]:cursor-pointer';

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[620px] flex-col sm:max-w-[620px]">
                <SheetHeader>
                    <SheetTitle>{editing ? `${t('edit_asset')}: ${editing.tag}` : t('register_asset')}</SheetTitle>
                    <SheetDescription>{t('assets_sub')}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    {/* Acquisition source toggle */}
                    <div>
                        <div className="mb-2 text-xs font-semibold text-muted-foreground">{t('asset_source')}</div>
                        <div className="grid grid-cols-2 gap-2">
                            {(['purchased', 'rented'] as AssetSource[]).map((s) => (
                                <button
                                    type="button"
                                    key={s}
                                    onClick={() => upd('source', s)}
                                    className={cn(
                                        'rounded-lg border p-3 text-center text-sm transition-colors',
                                        form.source === s ? 'border-brand bg-brand/5 text-brand' : 'border-border hover:bg-accent',
                                    )}
                                >
                                    {s === 'rented' ? t('asset_lease') : t('asset_purchase')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('asset_type')} required>
                            <select
                                value={form.type}
                                onChange={(e) => upd('type', e.target.value as AssetType)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-brand"
                            >
                                {ASSET_TYPES.map((tp) => (
                                    <option key={tp} value={tp}>
                                        {t(`asset_type_${tp}`)}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label={t('asset_brand')}>
                            <Input value={form.brand} onChange={(e) => upd('brand', e.target.value)} placeholder="Dell" />
                        </Field>
                    </div>

                    <Field label={t('asset_model')} required error={err.model}>
                        <Input value={form.model} onChange={(e) => upd('model', e.target.value)} placeholder="Dell Latitude 5440" />
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('asset_serial')}>
                            <Input value={form.serial} onChange={(e) => upd('serial', e.target.value)} className="font-mono" />
                        </Field>
                        <Field label={t('asset_owner')}>
                            <Input value={form.owner} onChange={(e) => upd('owner', e.target.value)} placeholder="EMP-1042 / Pool — IT" />
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t('asset_dept')}>
                            <Input value={form.department} onChange={(e) => upd('department', e.target.value)} />
                        </Field>
                        <Field label={t('asset_location')}>
                            <Input value={form.location} onChange={(e) => upd('location', e.target.value)} />
                        </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Field label={`${rented ? t('asset_monthly_fee') : t('asset_purchase_price')}`} required error={err.value}>
                            <Input
                                inputMode="numeric"
                                className="font-mono"
                                value={form.value ? Number(form.value).toLocaleString() : ''}
                                onChange={(e) => upd('value', e.target.value.replace(/[^\d]/g, ''))}
                                placeholder="32,100"
                            />
                        </Field>
                        <Field label={t('asset_supplier')}>
                            <Input value={form.supplier} onChange={(e) => upd('supplier', e.target.value)} />
                        </Field>
                    </div>

                    {rented ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label={t('asset_lease_start')}>
                                    <Input type="date" className={dateInput} value={form.lease_start} onChange={(e) => upd('lease_start', e.target.value)} />
                                </Field>
                                <Field label={t('asset_lease_end')}>
                                    <Input type="date" className={dateInput} value={form.lease_end} onChange={(e) => upd('lease_end', e.target.value)} />
                                </Field>
                            </div>
                            <Field label={t('asset_linked_contract')}>
                                <SearchableSelect
                                    value={form.contract_id}
                                    onChange={(v) => upd('contract_id', v)}
                                    options={contractOptions}
                                    placeholder={lang === 'th' ? 'เลือกสัญญา (ถ้ามี)' : 'Select contract (optional)'}
                                />
                            </Field>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t('asset_purchase_date')}>
                                <Input type="date" className={dateInput} value={form.purchase_date} onChange={(e) => upd('purchase_date', e.target.value)} />
                            </Field>
                            <Field label={t('asset_warranty_end')}>
                                <Input type="date" className={dateInput} value={form.warranty_end} onChange={(e) => upd('warranty_end', e.target.value)} />
                            </Field>
                        </div>
                    )}

                    <Field label={t('asset_notes')}>
                        <textarea
                            value={form.notes}
                            onChange={(e) => upd('notes', e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                        />
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={saving || saveState === 'done'}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {saving ? (lang === 'th' ? 'กำลังบันทึก…' : 'Saving…') : saveState === 'done' ? (lang === 'th' ? 'บันทึกแล้ว' : 'Saved!') : t('save')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
