import { useT } from '@/lang';
import { useAssetModels, useBrands, useCategories, useUnits, useWarrantyTypes } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SerialToggle } from '@/shared/components/serial-toggle';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useLocalName } from '@/shared/hooks/use-local-name';
import { nameSearch } from '@/shared/lib/local-name';
import { digitsOnly } from '@/shared/lib/number';
import type { StockItem } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirmEdit } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Switch } from '@/shared/ui/switch';
import { useToastStore } from '@/stores/toast';
import { useEffect, useState } from 'react';
import type { StockItemPayload } from '../api/stockApi';
import { useStockItemMutations } from '../hooks/use-stock';
import { stockRefusalText } from '../lib/refusal';

const empty: StockItemPayload = {
    sku: '',
    name: '',
    serial: '',
    track_serial: false,
    category_id: null,
    brand_id: null,
    model_id: null,
    unit_id: null,
    min_stock: 0,
    max_stock: 0,
    warranty_type_id: null,
};

/** Map an existing item onto the form payload (keys ordered like `empty` for the dirty check). */
function itemToForm(item: StockItem): StockItemPayload {
    return {
        sku: item.sku,
        name: item.name,
        serial: item.serial ?? '',
        track_serial: item.track_serial,
        category_id: item.category_id,
        brand_id: item.brand_id,
        model_id: item.model_id,
        unit_id: item.unit_id,
        min_stock: item.min_stock,
        max_stock: item.max_stock,
        warranty_type_id: item.warranty_type_id,
    };
}

/**
 * StockItemModal — add/edit a stock item. Dropdowns pull from the shared Master
 * Data lookups. The Save button shows a spinner then a checkmark on success.
 */
export function StockItemModal({ open, item, onClose }: { open: boolean; item?: StockItem | null; onClose: () => void }) {
    const t = useT();
    const nameOf = useLocalName();
    const confirmEdit = useConfirmEdit();
    const { create, update } = useStockItemMutations();
    const { data: categories = [] } = useCategories();
    const { data: units = [] } = useUnits();
    const { data: warranties = [] } = useWarrantyTypes();
    const { data: brands = [] } = useBrands();
    const { data: models = [] } = useAssetModels();
    const [form, setForm] = useState<StockItemPayload>(empty);
    // When on, the item name is generated from Brand + Model instead of typed
    const [autoName, setAutoName] = useState(false);
    const [saved, setSaved] = useState(false);
    const saving = create.isPending || update.isPending;
    const closeAfterSave = useCloseAfterSave(open, onClose);

    useEffect(() => {
        if (!open) return;
        setForm(item ? itemToForm(item) : empty);
        setAutoName(false);
        setSaved(false);
    }, [open, item]);

    // Auto item name = "Brand Model", kept in sync while the switch is on
    const brandName = brands.find((b) => b.id === form.brand_id)?.name;
    const modelName = models.find((m) => m.id === form.model_id)?.name;
    const autoItemName = [brandName, modelName].filter(Boolean).join(' ').trim();
    useEffect(() => {
        if (autoName) {
            setForm((f) => ({ ...f, name: autoItemName }));
        }
    }, [autoName, autoItemName]);

    // Save stays disabled until something changes; the same check guards closing
    const isDirty = JSON.stringify(form) !== JSON.stringify(item ? itemToForm(item) : empty);
    const guardClose = useDiscardGuard(open && isDirty && !saved);
    const minMaxInvalid = Number(form.max_stock) < Number(form.min_stock);
    // SKU is auto-generated on create; everything else below is required
    const isValid =
        !!form.name.trim() &&
        form.category_id != null &&
        form.brand_id != null &&
        form.model_id != null &&
        form.warranty_type_id != null &&
        !minMaxInvalid;

    const set = <K extends keyof StockItemPayload>(k: K, v: StockItemPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Models are scoped to the chosen brand; with no brand picked, show them all
    const selectedBrand = brands.find((b) => b.id === form.brand_id);
    const modelOptions = selectedBrand ? models.filter((m) => m.brand_id === selectedBrand.id) : models;

    const submit = async () => {
        if (saving || saved || !form.name.trim() || (item && !form.sku.trim())) return;
        if (item && isDirty && !(await confirmEdit({ name: item.name, sub: item.sku }))) return;
        try {
            if (item) {
                await update.mutateAsync({ id: item.id, payload: form });
            } else {
                await create.mutateAsync(form);
            }
            setSaved(true);
            closeAfterSave();
        } catch (e) {
            useToastStore.getState().push(stockRefusalText(e, t), 'error');
        }
    };

    const dialogTitle = item ? t('stock_edit_item') : t('stock_new_item');

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                    <DialogDescription className="sr-only">{dialogTitle}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    {/* SKU is system-generated; always read-only */}
                    <Field label={t('stock_sku')} required={!!item}>
                        <Input name="sku" value={form.sku} disabled placeholder={t('stock_sku_auto')} />
                    </Field>
                    <Field
                        label={t('stock_item_name')}
                        required
                        action={
                            <span className="text-muted-foreground flex items-center gap-1.5 text-xs" title={t('stock_item_name_auto_hint')}>
                                <span className="font-medium">{t('stock_item_name_auto')}</span>
                                <Switch checked={autoName} onChange={setAutoName} aria-label={t('stock_item_name_auto')} />
                            </span>
                        }
                    >
                        <Input
                            name="item_name"
                            autoComplete="off"
                            value={form.name}
                            onChange={(e) => set('name', e.target.value)}
                            disabled={autoName}
                            placeholder={autoName ? t('stock_item_name_auto_hint') : undefined}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_category')} required>
                            <SearchableSelect
                                value={form.category_id != null ? String(form.category_id) : ''}
                                onChange={(v) => set('category_id', v ? Number(v) : null)}
                                options={categories.map((c) => ({ value: String(c.id), label: nameOf(c), search: nameSearch(c) }))}
                            />
                        </Field>
                        <Field label={t('stock_unit')}>
                            <SearchableSelect
                                value={form.unit_id != null ? String(form.unit_id) : ''}
                                onChange={(v) => set('unit_id', v ? Number(v) : null)}
                                placeholder={t('stock_unit')}
                                options={units.map((u) => ({ value: String(u.id), label: u.name, search: u.name }))}
                            />
                        </Field>
                    </div>
                    <SerialToggle value={form.track_serial ?? false} onChange={(v) => set('track_serial', v)} confirmOnEnable />
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_brand')} required>
                            <SearchableSelect
                                value={form.brand_id != null ? String(form.brand_id) : ''}
                                onChange={(v) => setForm((f) => ({ ...f, brand_id: v ? Number(v) : null, model_id: null }))}
                                options={brands.map((b) => ({ value: String(b.id), label: b.name, search: b.name }))}
                            />
                        </Field>
                        <Field label={t('stock_model')} required>
                            <SearchableSelect
                                value={form.model_id != null ? String(form.model_id) : ''}
                                onChange={(v) => set('model_id', v ? Number(v) : null)}
                                options={modelOptions.map((m) => ({ value: String(m.id), label: m.name, search: m.name }))}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_min_stock')}>
                            <Input
                                name="min_stock"
                                inputMode="numeric"
                                autoComplete="off"
                                value={form.min_stock}
                                onChange={(e) => set('min_stock', Number(digitsOnly(e.target.value)))}
                            />
                        </Field>
                        <Field label={t('stock_max_stock')} error={minMaxInvalid ? t('stock_minmax_invalid') : undefined}>
                            <Input
                                name="max_stock"
                                inputMode="numeric"
                                autoComplete="off"
                                value={form.max_stock}
                                onChange={(e) => set('max_stock', Number(digitsOnly(e.target.value)))}
                            />
                        </Field>
                    </div>
                    <Field label={t('stock_warranty')} required>
                        <SearchableSelect
                            value={form.warranty_type_id != null ? String(form.warranty_type_id) : ''}
                            onChange={(v) => set('warranty_type_id', v ? Number(v) : null)}
                            options={warranties.map((w) => ({ value: String(w.id), label: w.name, search: w.name }))}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={saving}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={saving} success={saved} onClick={submit} disabled={!saved && (!isValid || !isDirty)} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
