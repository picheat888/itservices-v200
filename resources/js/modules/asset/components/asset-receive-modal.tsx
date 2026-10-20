import { useT } from '@/lang';
import { useWarehouses } from '@/modules/settings';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { Field, FormErrorBanner } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useFormError } from '@/shared/hooks/use-form-error';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { serverMessage } from '@/shared/lib/api-errors';
import type { Asset } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Box, Check, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAssetMutations } from '../hooks/use-assets';

/** Put assets back into a warehouse: 'receive' a returned asset, or 'recall' a hand-over; single (`asset`) or bulk (`ids` + `open`). */
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
    const fmtN = useNumberFormat();
    const { receive, recall, bulkRecall, bulkReceive } = useAssetMutations();
    const { data: warehouses = [] } = useWarehouses();
    const [warehouse, setWarehouse] = useState('');
    const formError = useFormError();
    const clearFormError = formError.clear;
    // The last single asset stays shown through the exit animation
    const [shownAsset, setShownAsset] = useState<Asset | null>(asset ?? null);

    const isRecall = mode === 'recall';
    const isBulk = ids != null;
    const isOpen = isBulk ? !!open : !!asset;
    const busy = isBulk ? (isRecall ? bulkRecall.isPending : bulkReceive.isPending) : isRecall ? recall.isPending : receive.isPending;

    useEffect(() => {
        if (asset) setShownAsset(asset);
    }, [asset]);

    // The picker starts on the asset's own warehouse; left alone while closing
    useEffect(() => {
        if (!isOpen) return;
        setWarehouse(asset?.warehouse ?? '');
        clearFormError();
    }, [asset, open, isOpen, clearFormError]);

    const options = warehouses.map((w) => ({ value: w.name, label: w.name, search: w.name }));

    const submit = async () => {
        if (!warehouse.trim()) return;
        formError.clear();
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
            // A 422 on a single recall: the recipient accepted before IT pulled it back
            const status = (err as { response?: { status?: number } }).response?.status;
            if (isRecall && !isBulk && status === 422) {
                formError.show(t('asset_recall_stale'));
            } else {
                formError.show(serverMessage(err) ?? t('asset_action_failed'));
            }
        }
    };

    const title = isBulk
        ? isRecall
            ? t('asset_bulk_recall_title')
            : t('asset_bulk_receive_title')
        : isRecall
          ? t('asset_recall_title')
          : t('asset_receive_title');
    // Asset code (or the selected count) on top, the model as the chip
    const eyebrow = isBulk ? t('asset_bulk_count').replace('{count}', fmtN(ids?.length ?? 0)) : (shownAsset?.asset_code ?? '');
    const note = isBulk ? null : isRecall ? t('asset_recall_sub') : t('asset_receive_sub');

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
            <FormDialogContent>
                <FocusDialogHeader
                    icon={Box}
                    eyebrow={eyebrow}
                    title={title}
                    code={isBulk ? undefined : shownAsset?.model || undefined}
                    srDescription={note ?? eyebrow}
                />

                <DialogBody>
                    <FormErrorBanner message={formError.message} shakeKey={formError.shakeKey} />
                    {note && <p className="text-muted-foreground text-sm">{note}</p>}
                    <Field label={t('asset_warehouse')} required help={t(isRecall ? 'asset_recall_hint' : 'asset_receive_hint')}>
                        <SearchableSelect
                            value={warehouse}
                            onChange={setWarehouse}
                            options={options}
                            preferDown
                            placeholder={t('asset_select_destination_warehouse')}
                        />
                    </Field>
                </DialogBody>

                <DialogFooterBar>
                    <Button variant="outline" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <SaveButton onClick={submit} loading={busy} disabled={!warehouse.trim()}>
                        {isRecall ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                        {t(isRecall ? 'asset_recall_action' : 'asset_mark_received')}
                    </SaveButton>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
