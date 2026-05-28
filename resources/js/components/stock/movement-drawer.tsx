import { Field } from '@/components/shared/field';
import { SaveButton } from '@/components/shared/save-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRecordMovement, useStockItems } from '@/hooks/use-stock';
import { useT } from '@/lib/i18n';
import type { StockMovementType } from '@/types';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';

const CLOSE_DELAY_MS = 1100;

/**
 * MovementDrawer — records a stock movement of the given kind
 * (receive / issue / return / transfer) and adjusts on-hand stock on save.
 */
export function MovementDrawer({ kind, onClose }: { kind: StockMovementType | null; onClose: () => void }) {
    const t = useT();
    const open = kind !== null;
    const record = useRecordMovement();
    const { data: items = [] } = useStockItems({});
    const [sku, setSku] = useState<string>('');
    const [qty, setQty] = useState(1);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [reference, setReference] = useState('');
    const [notes, setNotes] = useState('');

    const selected = items.find((i) => String(i.id) === sku);

    useEffect(() => {
        if (!open) return;
        const first = items[0];
        setSku(first ? String(first.id) : '');
        setQty(1);
        setReference('');
        setNotes('');
        // Sensible from/to defaults per movement kind.
        setFrom(kind === 'receive' ? '' : (first?.warehouse ?? ''));
        setTo(kind === 'receive' || kind === 'return' ? (first?.warehouse ?? '') : '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, kind]);

    const submit = async () => {
        if (!selected || qty < 1) return;
        try {
            await record.mutateAsync({
                type: kind!,
                stock_item_id: selected.id,
                qty,
                from_label: from.trim() || undefined,
                to_label: to.trim() || undefined,
                reference: reference.trim() || undefined,
                notes: notes.trim() || undefined,
            });
            setTimeout(onClose, CLOSE_DELAY_MS);
        } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Swal.fire({ icon: 'error', title: 'Error', text: msg ?? 'Something went wrong.' });
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{kind ? t(`stock_mv_${kind}` as Parameters<typeof t>[0]) : ''}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Field label={t('stock_item')} required>
                        <Select value={sku || undefined} onValueChange={setSku}>
                            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                                {items.map((i) => (
                                    <SelectItem key={i.id} value={String(i.id)}>{i.sku} — {i.name} ({i.current_stock})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_qty')} required>
                            <Input type="number" min={1} value={qty} onChange={(e) => setQty(+e.target.value)} className="font-mono" />
                        </Field>
                        <Field label={t('stock_reference')}>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO-2026-118 / REQ-12" className="font-mono" />
                        </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('stock_from')}>
                            <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder={kind === 'receive' ? t('stock_supplier') : t('stock_warehouse')} />
                        </Field>
                        <Field label={t('stock_to')}>
                            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={kind === 'issue' ? 'EMP-1234' : t('stock_warehouse')} />
                        </Field>
                    </div>
                    <Field label={t('stock_notes')}>
                        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={record.isPending}>{t('cancel')}</Button>
                    <SaveButton loading={record.isPending} onClick={submit} disabled={!selected || qty < 1} />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
