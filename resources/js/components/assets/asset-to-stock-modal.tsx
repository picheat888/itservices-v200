import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssetMutations } from '@/hooks/use-assets';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/types';
import { Archive, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Convert an asset into a stock item; the asset becomes "pending stock". */
export function AssetToStockModal({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { toStock } = useAssetMutations();
    const [sku, setSku] = useState('');
    const [warehouse, setWarehouse] = useState('');
    const [qty, setQty] = useState('1');
    const [reason, setReason] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => {
        if (asset) setSku(asset.tag.replace(/^(INB|RNT)-/, 'STK-'));
        setWarehouse('');
        setQty('1');
        setReason('');
        setErr('');
    }, [asset]);

    const submit = async () => {
        if (!sku.trim()) {
            setErr(lang === 'th' ? 'จำเป็นต้องกรอก SKU' : 'SKU is required');
            return;
        }
        if (!asset) return;
        try {
            await toStock.mutateAsync({ id: asset.id, sku: sku.trim(), warehouse: warehouse.trim() || undefined, qty: Number(qty) || 1, reason: reason.trim() || undefined });
            onClose();
        } catch {
            setErr(lang === 'th' ? 'SKU ซ้ำหรือบันทึกไม่สำเร็จ' : 'Duplicate SKU or save failed');
        }
    };

    return (
        <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>{t('asset_to_stock')}</SheetTitle>
                    <SheetDescription>{asset ? `${asset.tag} — ${asset.model}` : ''}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-5 overflow-y-auto px-1">
                    <Field label="SKU" required error={err}>
                        <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" placeholder="STK-LT-00231" />
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={lang === 'th' ? 'จำนวน' : 'Quantity'}>
                            <Input inputMode="numeric" className="font-mono" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))} />
                        </Field>
                        <Field label={lang === 'th' ? 'คลัง' : 'Warehouse'}>
                            <Input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
                        </Field>
                    </div>
                    <Field label={t('asset_reason')}>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                        />
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={toStock.isPending}>
                        {toStock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                        {t('asset_to_stock')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
