import { useT } from '@/lang';
import { useWarehouses } from '@/modules/settings';
import { Field } from '@/shared/components/field';
import { SearchableSelect } from '@/shared/components/searchable-select';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';
import { Check, Loader2, RotateCcw, Warehouse } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/**
 * Put assets back into the pool via a destination-warehouse picker. Serves both the
 * single-asset flow (`asset`) and the bulk flow (`ids` + `open`). Two modes:
 *  - 'receive': a returned asset (pending_return → ready).
 *  - 'recall': cancel a hand-over / pull a shared (or, with force, any) asset back.
 */
export function AssetReceiveModal({
    asset,
    ids,
    open,
    onClose,
    onDone,
    mode = 'receive',
}: {
    asset?: Asset | null;
    ids?: number[];
    open?: boolean;
    onClose: () => void;
    onDone?: () => void;
    mode?: 'receive' | 'recall';
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { receive, recall, bulkRecall, bulkReceive } = useAssetMutations();
    const { data: warehouses = [] } = useWarehouses();
    const [warehouse, setWarehouse] = useState('');
    // Retain the last single asset so its info card keeps rendering while the dialog animates
    // closed — clearing `asset` on close otherwise blanks the card mid-animation.
    const [shownAsset, setShownAsset] = useState<Asset | null>(asset ?? null);

    const isRecall = mode === 'recall';
    const isBulk = ids != null;
    const isOpen = isBulk ? !!open : !!asset;
    const busy = isBulk ? (isRecall ? bulkRecall.isPending : bulkReceive.isPending) : isRecall ? recall.isPending : receive.isPending;

    useEffect(() => {
        if (asset) setShownAsset(asset);
    }, [asset]);

    // Default the picker to the asset's current warehouse when the dialog opens; leave the value
    // alone while it's closing so it doesn't blank out during the exit animation (single flow only).
    useEffect(() => {
        if (!isOpen) return;
        setWarehouse(asset?.warehouse ?? '');
    }, [asset, open, isOpen]);

    const options = warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }));

    const submit = async () => {
        if (!warehouse.trim()) return;
        try {
            if (isBulk) {
                if (isRecall) await bulkRecall.mutateAsync({ ids, warehouse: warehouse.trim() });
                else await bulkReceive.mutateAsync({ ids, warehouse: warehouse.trim() });
                (onDone ?? onClose)();
                return;
            }
            if (!asset) return;
            const single = isRecall ? recall : receive;
            await single.mutateAsync({ id: asset.id, warehouse: warehouse.trim() });
            onClose();
        } catch (err) {
            // A 422 on a single recall usually means the recipient accepted the hand-over
            // before IT could pull it back — surface that; otherwise a generic failure.
            const status = (err as { response?: { status?: number } }).response?.status;
            if (isRecall && !isBulk && status === 422) {
                useToastStore.getState().push(t('asset_recall_stale'), 'error', t('asset_recall_stale_title'));
            } else {
                useToastStore.getState().push(t('asset_action_failed'), 'error', t('asset_action_failed_title'));
            }
            onClose();
        }
    };

    const title = isBulk
        ? isRecall
            ? t('asset_bulk_recall_title')
            : t('asset_bulk_receive_title')
        : isRecall
          ? t('asset_recall_title')
          : t('asset_receive_title');
    const sub = isBulk
        ? t('asset_bulk_count').replace('{count}', String(ids?.length ?? 0))
        : isRecall
          ? t('asset_recall_sub')
          : t('asset_receive_sub');

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-md gap-0 p-0">
                <div className="flex items-center gap-3 px-5 pt-5 pb-1">
                    <div
                        className={
                            isRecall
                                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400'
                                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                        }
                    >
                        {isRecall ? <RotateCcw className="h-5 w-5" /> : <Check className="h-5 w-5" />}
                    </div>
                    <div>
                        <DialogTitle className="text-base font-extrabold">{title}</DialogTitle>
                        <DialogDescription className="text-muted-foreground mt-0.5 text-xs">{sub}</DialogDescription>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {shownAsset && !isBulk && (
                        <div className="border-border bg-muted/40 flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                            <Warehouse className="text-brand h-4 w-4 shrink-0" />
                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">{shownAsset.model}</div>
                                <div className="text-muted-foreground font-mono text-[11px]">
                                    {shownAsset.asset_code}
                                    {shownAsset.warehouse ? ` · ${lang === 'th' ? 'เดิมอยู่' : 'from'}: ${shownAsset.warehouse}` : ''}
                                </div>
                            </div>
                        </div>
                    )}

                    <Field label={t('asset_warehouse')} required>
                        <SearchableSelect
                            value={warehouse}
                            onChange={setWarehouse}
                            options={options}
                            preferDown
                            placeholder={lang === 'th' ? 'เลือกคลังปลายทาง' : 'Select destination warehouse'}
                        />
                    </Field>
                    <p className="text-muted-foreground text-xs">{t(isRecall ? 'asset_recall_hint' : 'asset_receive_hint')}</p>
                </div>

                <div className="border-border/60 bg-muted/30 flex justify-end gap-2 border-t px-5 py-3">
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={submit} disabled={busy || !warehouse.trim()}>
                        {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isRecall ? (
                            <RotateCcw className="h-4 w-4" />
                        ) : (
                            <Check className="h-4 w-4" />
                        )}
                        {t(isRecall ? 'asset_recall_action' : 'asset_mark_received')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
