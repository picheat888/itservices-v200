import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useToastStore } from '@/stores/toast';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStockItems, useStockRequestActions } from '../hooks/use-stock';

const CLOSE_DELAY_MS = 1100;

/** RequestDrawer — submit a new stock request (Requester → approver → fulfilled). */
export function RequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { submit } = useStockRequestActions();
    const { data: items = [] } = useStockItems({});
    const [sku, setSku] = useState('');
    // Keep the raw text so the field can be cleared/retyped freely; derive the number.
    const [qtyInput, setQtyInput] = useState('1');
    const qty = parseInt(qtyInput, 10) || 0;
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (!open) return;
        const first = items[0];
        setSku(first ? String(first.id) : '');
        setQtyInput('1');
        setReason('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Available-to-request = on-hand − reserved (approved-but-unfulfilled requests),
    // so two approvals can't over-commit the same stock.
    const selected = items.find((i) => String(i.id) === sku);
    const onHand = selected?.current_stock ?? 0;
    const reserved = selected?.reserved ?? 0;
    const available = Math.max(0, onHand - reserved);
    const over = qty > available;
    const canSubmit = !!sku && qty >= 1 && !!reason.trim() && !over;

    const send = async () => {
        if (!canSubmit) return;
        try {
            await submit.mutateAsync({ stock_item_id: Number(sku), qty, reason: reason.trim() });
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            useToastStore.getState().push('Something went wrong.', 'error');
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('stock_new_request')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('stock_item')} required>
                        <SearchableSelect
                            value={sku}
                            onChange={setSku}
                            placeholder="—"
                            options={items.map((i) => ({
                                value: String(i.id),
                                label: `${i.sku} — ${i.name}`,
                                sub: `(${i.current_stock})`,
                                search: `${i.sku} ${i.name}`,
                            }))}
                        />
                    </Field>
                    <Field label={t('stock_qty')} required>
                        <Input
                            type="number"
                            min={1}
                            max={available || undefined}
                            value={qtyInput}
                            onChange={(e) => setQtyInput(e.target.value)}
                            className="font-mono"
                            aria-invalid={over}
                        />
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                                {t('stock_available')}:{' '}
                                <b className={cn('font-mono', available > 0 ? 'text-emerald-600' : 'text-destructive')}>{available}</b>{' '}
                                {selected?.unit}
                            </span>
                            {over && (
                                <span className="text-destructive flex items-center gap-1 font-medium">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {t('stock_request_over')} ({available})
                                </span>
                            )}
                        </div>
                    </Field>
                    <Field label={t('stock_reason')} required>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('stock_reason_ph')} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submit.isPending}>
                        {t('cancel')}
                    </Button>
                    <SaveButton loading={submit.isPending} onClick={send} disabled={!canSubmit}>
                        {t('stock_submit')}
                    </SaveButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
