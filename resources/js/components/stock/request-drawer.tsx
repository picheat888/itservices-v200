import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/shared/searchable-select';
import { useStockItems, useStockRequestActions } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

const CLOSE_DELAY_MS = 1100;

/** RequestDrawer — submit a new stock request (Requester → approver → fulfilled). */
export function RequestDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { submit } = useStockRequestActions();
    const { data: items = [] } = useStockItems({});
    const [sku, setSku] = useState('');
    const [qty, setQty] = useState(1);
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (!open) return;
        const first = items[0];
        setSku(first ? String(first.id) : '');
        setQty(1);
        setReason('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const send = async () => {
        if (!sku || qty < 1 || !reason.trim()) return;
        try {
            await submit.mutateAsync({ stock_item_id: Number(sku), qty, reason: reason.trim() });
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Something went wrong.' });
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
                                label: `${i.sku} — ${i.name} (${i.current_stock})`,
                                search: `${i.sku} ${i.name}`,
                            }))}
                        />
                    </Field>
                    <Field label={t('stock_qty')} required>
                        <Input type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} className="font-mono" />
                    </Field>
                    <Field label={t('stock_reason')} required>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('stock_reason_ph')} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={submit.isPending}>{t('cancel')}</Button>
                    <SaveButton loading={submit.isPending} onClick={send} disabled={!sku || qty < 1 || !reason.trim()}>
                        {t('stock_submit')}
                    </SaveButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
