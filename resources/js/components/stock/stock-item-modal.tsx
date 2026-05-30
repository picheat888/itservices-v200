import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    category: '',
    brand: '',
    model: '',
    unit: 'unit',
    cost: 0,
    current_stock: 0,
    min_stock: 0,
    max_stock: 0,
    warehouse: '',
    supplier: '',
    warranty: '',
};

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
        setForm(
            item
                ? {
                      sku: item.sku,
                      name: item.name,
                      serial: item.serial ?? '',
                      category: item.category ?? '',
                      brand: item.brand ?? '',
                      model: item.model ?? '',
                      unit: item.unit,
                      cost: item.cost,
                      current_stock: item.current_stock,
                      min_stock: item.min_stock,
                      max_stock: item.max_stock,
                      warehouse: item.warehouse ?? '',
                      supplier: item.supplier ?? '',
                      warranty: item.warranty ?? '',
                  }
                : empty,
        );
    }, [open, item]);

    const set = <K extends keyof StockItemPayload>(k: K, v: StockItemPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Models are scoped to the chosen brand; with no brand picked, show them all.
    const selectedBrand = brands.find((b) => b.name === form.brand);
    const modelOptions = selectedBrand ? models.filter((m) => m.brand_id === selectedBrand.id) : models;

    const submit = async () => {
        if (!form.sku.trim() || !form.name.trim()) return;
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
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{item ? t('stock_edit_item') : t('stock_new_item')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="SKU" required>
                            <Input
                                value={form.sku}
                                onChange={(e) => set('sku', e.target.value)}
                                disabled={!!item}
                                placeholder="SK-NB-003"
                                className="font-mono"
                            />
                        </Field>
                        <Field label={t('stock_serial')}>
                            <Input value={form.serial ?? ''} onChange={(e) => set('serial', e.target.value)} className="font-mono" />
                        </Field>
                    </div>
                    <Field label={t('stock_item_name')} required>
                        <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_category')}>
                            <Select value={form.category || undefined} onValueChange={(v) => set('category', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={c.name}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('stock_unit')}>
                            <Select value={form.unit || undefined} onValueChange={(v) => set('unit', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="unit" />
                                </SelectTrigger>
                                <SelectContent>
                                    {units.map((u) => (
                                        <SelectItem key={u.id} value={u.name}>
                                            {u.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_brand')}>
                            <Select value={form.brand || undefined} onValueChange={(v) => setForm((f) => ({ ...f, brand: v, model: '' }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    {brands.map((b) => (
                                        <SelectItem key={b.id} value={b.name}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('stock_model')}>
                            <Select value={form.model || undefined} onValueChange={(v) => set('model', v)} disabled={modelOptions.length === 0}>
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    {modelOptions.map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        <Field label={t('stock_current')}>
                            <Input
                                type="number"
                                value={form.current_stock}
                                onChange={(e) => set('current_stock', +e.target.value)}
                                className="font-mono"
                            />
                        </Field>
                        <Field label="Min">
                            <Input type="number" value={form.min_stock} onChange={(e) => set('min_stock', +e.target.value)} className="font-mono" />
                        </Field>
                        <Field label="Max">
                            <Input type="number" value={form.max_stock} onChange={(e) => set('max_stock', +e.target.value)} className="font-mono" />
                        </Field>
                        <Field label={t('stock_cost')}>
                            <Input type="number" value={form.cost} onChange={(e) => set('cost', +e.target.value)} className="font-mono" />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_warehouse')}>
                            <Select value={form.warehouse || undefined} onValueChange={(v) => set('warehouse', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    {warehouses.map((w) => (
                                        <SelectItem key={w.id} value={w.name}>
                                            {w.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label={t('stock_supplier')}>
                            <Select value={form.supplier || undefined} onValueChange={(v) => set('supplier', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vendors.map((v) => (
                                        <SelectItem key={v.id} value={v.name}>
                                            {v.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                    </div>
                    <Field label={t('stock_warranty')}>
                        <Select value={form.warranty || undefined} onValueChange={(v) => set('warranty', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                                {warranties.map((w) => (
                                    <SelectItem key={w.id} value={w.name}>
                                        {w.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} onClick={submit} disabled={!form.sku.trim() || !form.name.trim()} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
