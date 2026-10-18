import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { useCloseAfterSave } from '@/shared/hooks/use-close-after-save';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { digitsOnly } from '@/shared/lib/number';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useToastStore } from '@/stores/toast';
import { useEffect, useRef, useState } from 'react';
import { useStockItems, useStockRequestActions } from '../hooks/use-stock';
import { stockRefusalText } from '../lib/refusal';
import { useNumberFormat } from '@/shared/hooks/use-number-format';

/** RequestDrawer — submit a new stock request (Requester → approver → fulfilled). */
export function RequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const { submit } = useStockRequestActions();
    const { data: items = [] } = useStockItems({}, open);
    const [sku, setSku] = useState('');
    // Raw text so the field can be cleared/retyped freely; the number is derived
    const [qtyInput, setQtyInput] = useState('1');
    const qty = parseInt(qtyInput, 10) || 0;
    const [reason, setReason] = useState('');
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSku('');
        setSaved(false);
        setQtyInput('1');
        setReason('');
    }, [open]);

    // Available-to-request = on-hand − reserved (approved-but-unfulfilled requests)
    const selected = items.find((i) => String(i.id) === sku);
    const onHand = selected?.current_stock ?? 0;
    const reserved = selected?.reserved ?? 0;
    const available = Math.max(0, onHand - reserved);
    const over = qty > available;
    const canSubmit = !!sku && qty >= 1 && !!reason.trim() && !over;
    const isDirty = sku !== '' || qtyInput !== '1' || reason !== '';
    const guardClose = useDiscardGuard(open && isDirty && !saved);

    const closeAfterSave = useCloseAfterSave(open, onClose);
    const sending = useRef(false);
    const send = async () => {
        if (sending.current || saved || !canSubmit) return;
        sending.current = true;
        try {
            await submit.mutateAsync({ stock_item_id: Number(sku), qty, reason: reason.trim() });
            setSaved(true);
            closeAfterSave();
        } catch (e) {
            useToastStore.getState().push(stockRefusalText(e, t), 'error');
        } finally {
            sending.current = false;
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('stock_new_request')}</DialogTitle>
                    <DialogDescription className="sr-only">{t('stock_new_request')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('stock_item')} required>
                        <SearchableSelect
                            value={sku}
                            onChange={setSku}
                            placeholder={t('stock_select_sku')}
                            options={items.map((i) => ({
                                value: String(i.id),
                                label: i.name,
                                sub: i.sku,
                                hint: `${t('stock_stock')} ${fmtN(i.current_stock)} ${i.unit ?? ''}`.trim(),
                                search: `${i.sku} ${i.name}`,
                            }))}
                        />
                    </Field>
                    <Field label={t('stock_qty')} required error={over ? `${t('stock_request_over')} (${fmtN(available)})` : undefined}>
                        {(control) => (
                            <>
                                <Input
                                    {...control}
                                    name="qty"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    value={qtyInput}
                                    onChange={(e) => setQtyInput(digitsOnly(e.target.value))}
                                />
                                <div className="text-muted-foreground mt-1.5 text-xs">
                                    {t('stock_available')}{' '}
                                    <b className={cn('tabular-nums', available > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}>
                                        {fmtN(available)}
                                    </b>{' '}
                                    {selected?.unit}
                                </div>
                            </>
                        )}
                    </Field>
                    <Field label={t('stock_reason')} required>
                        <Textarea
                            name="reason"
                            autoComplete="off"
                            rows={2}
                            className="min-h-0"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={`${t('stock_reason_ph')}…`}
                        />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => guardClose(onClose)} disabled={submit.isPending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={submit.isPending} success={saved} onClick={send} disabled={!saved && !canSubmit}>
                        {t('stock_submit')}
                    </SaveButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
