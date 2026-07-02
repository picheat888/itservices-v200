import { useWarehouses } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useAssetMutations } from '../hooks/use-assets';
import { useT } from '@/lang';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/shared/types';
import { Check, Loader2, Warehouse } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Confirm receiving a returned asset back into the pool, choosing which warehouse
 * to store it in (defaults to the asset's current warehouse). On confirm the asset
 * goes Ready + owner "Pool — IT" with the chosen warehouse.
 */
export function AssetReceiveModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { receive } = useAssetMutations();
    const { data: warehouses = [] } = useWarehouses();
    const [warehouse, setWarehouse] = useState('');

    // Default the picker to the asset's current warehouse whenever a new asset opens.
    useEffect(() => {
        setWarehouse(asset?.warehouse ?? '');
    }, [asset]);

    const options = warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }));

    const submit = async () => {
        if (!asset) return;
        await receive.mutateAsync({ id: asset.id, warehouse: warehouse.trim() || undefined });
        onClose();
    };

    return (
        <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-0 p-0">
                <div className="flex items-center gap-3 px-5 pt-5 pb-1">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-5 w-5" />
                    </div>
                    <div>
                        <DialogTitle className="text-base font-extrabold">{t('asset_receive_title')}</DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-0.5 text-xs">{t('asset_receive_sub')}</DialogDescription>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {asset && (
                        <div className="border-border bg-muted/40 flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                            <Warehouse className="text-brand h-4 w-4 shrink-0" />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{asset.model}</div>
                                <div className="text-muted-foreground font-mono text-[11px]">
                                    {asset.tag}
                                    {asset.warehouse ? ` · ${lang === 'th' ? 'เดิมอยู่' : 'from'}: ${asset.warehouse}` : ''}
                                </div>
                            </div>
                        </div>
                    )}

                    <Field label={t('asset_warehouse')}>
                        <SearchableSelect
                            value={warehouse}
                            onChange={setWarehouse}
                            options={options}
                            placeholder={lang === 'th' ? 'เลือกคลังปลายทาง' : 'Select destination warehouse'}
                            clearable
                        />
                    </Field>
                    <p className="text-muted-foreground text-xs">{t('asset_receive_hint')}</p>
                </div>

                <div className="border-border/60 bg-muted/30 flex justify-end gap-2 border-t px-5 py-3">
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={receive.isPending}>
                        {receive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {t('asset_receive_title')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
