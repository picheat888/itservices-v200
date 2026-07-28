import { useT } from '@/lang';
import { useAssetModels, useBrands, useCategories, useUnits, useWarrantyTypes } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SerialToggle } from '@/shared/components/serial-toggle';
import { cn } from '@/shared/lib/utils';
import type { StockItem } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useToastStore } from '@/stores/toast';
import { useEffect, useState } from 'react';
import type { StockItemPayload } from '../api/stockApi';
import { useStockItemMutations } from '../hooks/use-stock';

const CLOSE_DELAY_MS = 1100;

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

/** Map an existing item onto the editable form payload (keys ordered to match
 *  `empty` so two payloads can be compared for the "is dirty" check). */
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
    const confirm = useConfirm();
    const { create, update } = useStockItemMutations();
    const { data: categories = [] } = useCategories();
    const { data: units = [] } = useUnits();
    const { data: warranties = [] } = useWarrantyTypes();
    const { data: brands = [] } = useBrands();
    const { data: models = [] } = useAssetModels();
    const [form, setForm] = useState<StockItemPayload>(empty);
    // When on, the item name is generated from Brand + Model instead of typed.
    const [autoName, setAutoName] = useState(false);
    const saving = create.isPending || update.isPending;

    useEffect(() => {
        if (!open) return;
        setForm(item ? itemToForm(item) : empty);
        setAutoName(false);
    }, [open, item]);

    // Auto item name = "Brand Model" (whichever parts exist), resolved from the
    // selected master ids. Kept in sync while the Auto switch is on; turning it off
    // leaves the last value editable.
    const brandName = brands.find((b) => b.id === form.brand_id)?.name;
    const modelName = models.find((m) => m.id === form.model_id)?.name;
    const autoItemName = [brandName, modelName].filter(Boolean).join(' ').trim();
    useEffect(() => {
        if (autoName) {
            setForm((f) => ({ ...f, name: autoItemName }));
        }
    }, [autoName, autoItemName]);

    // When editing, the Save button stays disabled until something actually changes.
    const isDirty = !item || JSON.stringify(form) !== JSON.stringify(itemToForm(item));
    // SKU is auto-generated on create; everything else below is required.
    const isValid =
        !!form.name.trim() &&
        form.category_id != null &&
        form.brand_id != null &&
        form.model_id != null &&
        form.warranty_type_id != null &&
        // Max must be at least Min.
        Number(form.max_stock) >= Number(form.min_stock);

    const set = <K extends keyof StockItemPayload>(k: K, v: StockItemPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Models are scoped to the chosen brand; with no brand picked, show them all.
    const selectedBrand = brands.find((b) => b.id === form.brand_id);
    const modelOptions = selectedBrand ? models.filter((m) => m.brand_id === selectedBrand.id) : models;

    const submit = async () => {
        // SKU is auto-generated on create, so only the name is required (matches `isValid`).
        if (!form.name.trim() || (item && !form.sku.trim())) return;
        // Editing an existing item asks for confirmation before saving changes.
        if (item) {
            if (!(await confirm({ variant: 'edit', title: t('stock_edit_item'), description: t('stock_edit_confirm') }))) {
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
            useToastStore.getState().push('Something went wrong.', 'error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{item ? t('stock_edit_item') : t('stock_new_item')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {/* SKU is system-generated (SKU-#######); always read-only —
                        a placeholder hint stands in until the server assigns it. */}
                    <Field label="SKU" required={!!item}>
                        <Input value={form.sku} disabled placeholder={t('stock_sku_auto')} className="font-mono" />
                    </Field>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Label>
                                {t('stock_item_name')}
                                <span className="text-destructive ml-0.5">*</span>
                            </Label>
                            {/* Small switch: build the name automatically from Brand + Model. */}
                            <button
                                type="button"
                                onClick={() => setAutoName((v) => !v)}
                                aria-pressed={autoName}
                                title={t('stock_item_name_auto_hint')}
                                className="text-muted-foreground flex items-center gap-1.5 text-xs"
                            >
                                <span className="font-medium">{t('stock_item_name_auto')}</span>
                                <span
                                    className={cn(
                                        'relative h-4 w-7 shrink-0 rounded-full transition-colors',
                                        autoName ? 'bg-brand' : 'bg-muted-foreground/30',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all',
                                            autoName ? 'left-[14px]' : 'left-0.5',
                                        )}
                                    />
                                </span>
                            </button>
                        </div>
                        <Input
                            value={form.name}
                            onChange={(e) => set('name', e.target.value)}
                            disabled={autoName}
                            placeholder={autoName ? t('stock_item_name_auto_hint') : undefined}
                            autoFocus
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_category')} required>
                            <SearchableSelect
                                value={form.category_id != null ? String(form.category_id) : ''}
                                onChange={(v) => set('category_id', v ? Number(v) : null)}
                                placeholder="—"
                                options={categories.map((c) => ({ value: String(c.id), label: c.name, search: c.name }))}
                            />
                        </Field>
                        <Field label={t('stock_unit')}>
                            <SearchableSelect
                                value={form.unit_id != null ? String(form.unit_id) : ''}
                                onChange={(v) => set('unit_id', v ? Number(v) : null)}
                                placeholder="unit"
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
                                placeholder="—"
                                options={brands.map((b) => ({ value: String(b.id), label: b.name, search: b.name }))}
                            />
                        </Field>
                        <Field label={t('stock_model')} required>
                            <SearchableSelect
                                value={form.model_id != null ? String(form.model_id) : ''}
                                onChange={(v) => set('model_id', v ? Number(v) : null)}
                                placeholder="—"
                                options={modelOptions.map((m) => ({ value: String(m.id), label: m.name, search: m.name }))}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Min">
                            <Input
                                type="number"
                                min={0}
                                value={form.min_stock}
                                onChange={(e) => set('min_stock', Math.max(0, +e.target.value))}
                                className="font-mono"
                            />
                        </Field>
                        <Field label="Max">
                            <Input
                                type="number"
                                min={0}
                                value={form.max_stock}
                                onChange={(e) => set('max_stock', Math.max(0, +e.target.value))}
                                className="font-mono"
                            />
                        </Field>
                    </div>
                    {Number(form.max_stock) < Number(form.min_stock) && <p className="text-destructive text-xs">{t('stock_minmax_invalid')}</p>}
                    <Field label={t('stock_warranty')} required>
                        <SearchableSelect
                            value={form.warranty_type_id != null ? String(form.warranty_type_id) : ''}
                            onChange={(v) => set('warranty_type_id', v ? Number(v) : null)}
                            placeholder="—"
                            options={warranties.map((w) => ({ value: String(w.id), label: w.name, search: w.name }))}
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
