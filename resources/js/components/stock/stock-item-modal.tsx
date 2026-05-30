import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { SerialToggle } from '@/components/shared/serial-toggle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { useAssetModels, useBrands, useCategories, useUnits, useVendors, useWarehouses, useWarrantyTypes } from '@/hooks/use-master-data';
import { useStockItemMutations } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import type { StockItemPayload } from '@/services/stockApi';
import type { StockItem } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

const CLOSE_DELAY_MS = 1100;

const empty: StockItemPayload = {
    sku: '',
    name: '',
    serial: '',
    track_serial: false,
    category: '',
    brand: '',
    model: '',
    unit: 'unit',
    min_stock: 0,
    max_stock: 0,
    warehouse: '',
    supplier: '',
    warranty: '',
};

/** Map an existing item onto the editable form payload (keys ordered to match
 *  `empty` so two payloads can be compared for the "is dirty" check). */
function itemToForm(item: StockItem): StockItemPayload {
    return {
        sku: item.sku,
        name: item.name,
        serial: item.serial ?? '',
        track_serial: item.track_serial,
        category: item.category ?? '',
        brand: item.brand ?? '',
        model: item.model ?? '',
        unit: item.unit,
        min_stock: item.min_stock,
        max_stock: item.max_stock,
        warehouse: item.warehouse ?? '',
        supplier: item.supplier ?? '',
        warranty: item.warranty ?? '',
    };
}

/**
 * StockItemModal — add/edit a stock item. Dropdowns pull from the shared Master
 * Data lookups. The Save button shows a spinner then a checkmark on success.
 */
export function StockItemModal({ open, item, onClose }: { open: boolean; item?: StockItem | null; onClose: () => void }) {
    const t = useT();
    const { create, update } = useStockItemMutations();
    const { data: categories = [] } = useCategories();
    const { data: warehouses = [] } = useWarehouses();
    const { data: units = [] } = useUnits();
    const { data: vendors = [] } = useVendors();
    const { data: warranties = [] } = useWarrantyTypes();
    const { data: brands = [] } = useBrands();
    const { data: models = [] } = useAssetModels();
    const [form, setForm] = useState<StockItemPayload>(empty);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (!open) return;
        setForm(item ? itemToForm(item) : empty);
    }, [open, item]);

    // When editing, the Save button stays disabled until something actually changes.
    const isDirty = !item || JSON.stringify(form) !== JSON.stringify(itemToForm(item));
    const isValid = !!form.sku.trim() && !!form.name.trim();

    const set = <K extends keyof StockItemPayload>(k: K, v: StockItemPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Picking a category seeds the serial-tracking default from that category.
    // For an existing item we never silently flip the saved choice.
    const onCategoryChange = (v: string) => {
        const cat = categories.find((c) => c.name === v);
        setForm((f) => ({ ...f, category: v, track_serial: item ? f.track_serial : !!cat?.track_serial }));
    };

    // Models are scoped to the chosen brand; with no brand picked, show them all.
    const selectedBrand = brands.find((b) => b.name === form.brand);
    const modelOptions = selectedBrand ? models.filter((m) => m.brand_id === selectedBrand.id) : models;

    const submit = async () => {
        if (!form.sku.trim() || !form.name.trim()) return;
        // Editing an existing item asks for confirmation before saving changes.
        if (item) {
            const result = await Swal.fire({
                title: t('stock_edit_item'),
                text: t('stock_edit_confirm'),
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: t('save'),
                cancelButtonText: t('cancel'),
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#6b7280',
                customClass: {
                    popup: '!rounded-xl !shadow-xl',
                    confirmButton: '!rounded-lg !font-medium',
                    cancelButton: '!rounded-lg !font-medium',
                },
                reverseButtons: true,
                // Re-enable pointer events blocked by the parent Radix dialog.
                didOpen: () => {
                    const container = Swal.getContainer();
                    if (container) {
                        container.style.pointerEvents = 'auto';
                    }
                },
            });
            if (!result.isConfirmed) {
                return;
            }
        }
        try {
            if (item) {
                await update.mutateAsync({ id: item.id, payload: form });
            } else {
                await create.mutateAsync(form);
            }
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Something went wrong.' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent
                className="max-w-2xl"
                // While the serial-tracking confirm (Swal) is open, don't let its
                // Escape / backdrop click bubble up and close this modal too.
                onEscapeKeyDown={(e) => {
                    if (Swal.isVisible()) {
                        e.preventDefault();
                    }
                }}
                onInteractOutside={(e) => {
                    if (Swal.isVisible()) {
                        e.preventDefault();
                    }
                }}
            >
                <DialogHeader>
                    <DialogTitle>{item ? t('stock_edit_item') : t('stock_new_item')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label="SKU" required>
                        <Input
                            value={form.sku}
                            onChange={(e) => set('sku', e.target.value)}
                            disabled={!!item}
                            placeholder="SK-NB-003"
                            className="font-mono"
                        />
                    </Field>
                    <Field label={t('stock_item_name')} required>
                        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_category')}>
                            <SearchableSelect
                                value={form.category ?? ''}
                                onChange={onCategoryChange}
                                placeholder="—"
                                options={categories.map((c) => ({ value: c.name, label: c.name, search: c.name }))}
                            />
                        </Field>
                        <Field label={t('stock_unit')}>
                            <SearchableSelect
                                value={form.unit || ''}
                                onChange={(v) => set('unit', v)}
                                placeholder="unit"
                                options={units.map((u) => ({ value: u.name, label: u.name, search: u.name }))}
                            />
                        </Field>
                    </div>
                    <SerialToggle value={form.track_serial ?? false} onChange={(v) => set('track_serial', v)} confirmOnEnable />
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_brand')}>
                            <SearchableSelect
                                value={form.brand ?? ''}
                                onChange={(v) => setForm((f) => ({ ...f, brand: v, model: '' }))}
                                placeholder="—"
                                options={brands.map((b) => ({ value: b.name, label: b.name, search: b.name }))}
                            />
                        </Field>
                        <Field label={t('stock_model')}>
                            <SearchableSelect
                                value={form.model ?? ''}
                                onChange={(v) => set('model', v)}
                                placeholder="—"
                                options={modelOptions.map((m) => ({ value: m.name, label: m.name, search: m.name }))}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Min">
                            <Input type="number" value={form.min_stock} onChange={(e) => set('min_stock', +e.target.value)} className="font-mono" />
                        </Field>
                        <Field label="Max">
                            <Input type="number" value={form.max_stock} onChange={(e) => set('max_stock', +e.target.value)} className="font-mono" />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_warehouse')}>
                            <SearchableSelect
                                value={form.warehouse ?? ''}
                                onChange={(v) => set('warehouse', v)}
                                placeholder="—"
                                options={warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }))}
                            />
                        </Field>
                        <Field label={t('stock_supplier')}>
                            <SearchableSelect
                                value={form.supplier ?? ''}
                                onChange={(v) => set('supplier', v)}
                                placeholder="—"
                                options={vendors.map((v) => ({ value: v.name, label: v.name, search: v.name }))}
                            />
                        </Field>
                    </div>
                    <Field label={t('stock_warranty')}>
                        <SearchableSelect
                            value={form.warranty ?? ''}
                            onChange={(v) => set('warranty', v)}
                            placeholder="—"
                            options={warranties.map((w) => ({ value: w.name, label: w.name, search: w.name }))}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} onClick={submit} disabled={!isValid || !isDirty} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
