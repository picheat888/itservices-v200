import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { SerialToggle } from '@/shared/components/serial-toggle';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useAssetModels, useBrands, useCategories, useUnits, useWarrantyTypes } from '@/modules/settings';
import { useStockItemMutations } from '../hooks/use-stock';
import { useT } from '@/lib/i18n';
import { cn } from '@/shared/lib/utils';
import type { StockItemPayload } from '../api/stockApi';
import { useToastStore } from '@/stores/toast';
import type { StockItem } from '@/shared/types';
import { useEffect, useState } from 'react';

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
        warranty: item.warranty ?? '',
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

    // Auto item name = "Brand Model" (whichever parts exist). Kept in sync while
    // the Auto switch is on; turning it off leaves the last value editable.
    const autoItemName = [form.brand, form.model].filter(Boolean).join(' ').trim();
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
        !!form.category?.trim() &&
        !!form.brand?.trim() &&
        !!form.model?.trim() &&
        !!form.warranty?.trim() &&
        // Max must be at least Min.
        Number(form.max_stock) >= Number(form.min_stock);

    const set = <K extends keyof StockItemPayload>(k: K, v: StockItemPayload[K]) => setForm((f) => ({ ...f, [k]: v }));

    // Models are scoped to the chosen brand; with no brand picked, show them all.
    const selectedBrand = brands.find((b) => b.name === form.brand);
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
                                value={form.category ?? ''}
                                onChange={(v) => set('category', v)}
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
                        <Field label={t('stock_brand')} required>
                            <SearchableSelect
                                value={form.brand ?? ''}
                                onChange={(v) => setForm((f) => ({ ...f, brand: v, model: '' }))}
                                placeholder="—"
                                options={brands.map((b) => ({ value: b.name, label: b.name, search: b.name }))}
                            />
                        </Field>
                        <Field label={t('stock_model')} required>
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
