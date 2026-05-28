import { Field } from '@/components/shared/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssetMutations } from '@/hooks/use-assets';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/types';
import { Loader2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Hand an asset to a new owner; it becomes "pending acceptance" until confirmed. */
export function AssetTransferDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const { transfer } = useAssetMutations();
    const [owner, setOwner] = useState('');
    const [reason, setReason] = useState('');
    const [err, setErr] = useState('');

    useEffect(() => {
        setOwner('');
        setReason('');
        setErr('');
    }, [asset]);

    const submit = async () => {
        if (!owner.trim()) {
            setErr(lang === 'th' ? 'จำเป็นต้องกรอก' : 'Required');
            return;
        }
        if (!asset) return;
        try {
            await transfer.mutateAsync({ id: asset.id, owner: owner.trim(), reason: reason.trim() || undefined });
            onClose();
        } catch {
            setErr(lang === 'th' ? 'โอนไม่สำเร็จ' : 'Transfer failed');
        }
    };

    return (
        <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[480px] flex-col sm:max-w-[480px]">
                <SheetHeader>
                    <SheetTitle>{t('transfer_asset')}</SheetTitle>
                    <SheetDescription>{asset ? `${asset.tag} — ${asset.model}` : ''}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-5 overflow-y-auto px-1">
                    <Field label={lang === 'th' ? 'ผู้ถือครองปัจจุบัน' : 'Current owner'}>
                        <Input value={asset?.owner ?? '—'} disabled className="opacity-70" />
                    </Field>
                    <Field label={t('asset_new_owner')} required error={err}>
                        <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="EMP-2000 / Pool — Sales" autoFocus />
                    </Field>
                    <Field label={t('asset_transfer_reason')}>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-brand"
                            placeholder={lang === 'th' ? 'เช่น พนักงานใหม่' : 'e.g. New hire onboarding'}
                        />
                    </Field>
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                    <Button className="flex-1" onClick={submit} disabled={transfer.isPending}>
                        {transfer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                        {t('transfer_asset')}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
