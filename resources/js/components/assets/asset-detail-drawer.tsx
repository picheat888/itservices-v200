import { AssetStatusBadge, AssetTypeIcon } from '@/components/assets/asset-meta';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Asset } from '@/types';
import { Check, Share2 } from 'lucide-react';

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className="space-y-0.5">
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value || '—'}</div>
        </div>
    );
}

/** Read-only asset detail with general/ownership/acquisition sections. */
export function AssetDetailDrawer({
    asset,
    onClose,
    onTransfer,
    onReceive,
    canTransfer,
}: {
    asset: Asset | null;
    onClose: () => void;
    onTransfer: (a: Asset) => void;
    onReceive: (a: Asset) => void;
    canTransfer: boolean;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    if (!asset) return null;

    const rented = asset.source === 'rented';
    const blocked = ['deployed', 'writeoff', 'pending_stock'].includes(asset.status);

    return (
        <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="right" className="flex w-[560px] flex-col sm:max-w-[560px]">
                <SheetHeader>
                    <SheetTitle>{asset.tag}</SheetTitle>
                    <SheetDescription>{asset.model}</SheetDescription>
                </SheetHeader>

                <div className="mt-6 flex-1 space-y-6 overflow-y-auto px-1">
                    <div className="flex items-center gap-3">
                        <span className="bg-brand/10 text-brand flex h-12 w-12 items-center justify-center rounded-lg">
                            <AssetTypeIcon type={asset.type} className="h-5 w-5" />
                        </span>
                        <div className="flex-1">
                            <div className="font-semibold">{asset.model}</div>
                            <div className="text-muted-foreground font-mono text-xs">{asset.tag}</div>
                        </div>
                        <AssetStatusBadge status={asset.status} t={t} />
                    </div>

                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('asset_general')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <KV label={t('asset_type')} value={t(`asset_type_${asset.type}`)} />
                            <KV label={t('asset_brand')} value={asset.brand} />
                            <KV label={t('asset_serial')} value={asset.serial} mono />
                            <KV label={t('asset_source')} value={rented ? t('asset_lease') : t('asset_purchase')} />
                            <KV label={t('asset_location')} value={asset.location} />
                        </div>
                    </div>

                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('asset_ownership')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <KV label={t('asset_owner')} value={asset.owner} />
                            <KV label={t('asset_initial_owner')} value={asset.initial_owner} />
                            <KV label={t('asset_dept')} value={asset.department} />
                            <KV label={t('asset_registered')} value={asset.registered_date} mono />
                        </div>
                    </div>

                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('asset_acquisition')}</div>
                        <div className="grid grid-cols-2 gap-4">
                            <KV label={t('asset_value')} value={asset.value_display} mono />
                            {rented ? (
                                <>
                                    <KV label={t('asset_linked_contract')} value={asset.contract_code} mono />
                                    <KV label={t('asset_lease_start')} value={asset.lease_start} mono />
                                    <KV label={t('asset_lease_end')} value={asset.lease_end} mono />
                                </>
                            ) : (
                                <>
                                    <KV label={t('asset_purchase_date')} value={asset.purchase_date} mono />
                                    <KV label={t('asset_warranty_end')} value={asset.warranty_end} mono />
                                </>
                            )}
                            <KV label={t('asset_supplier')} value={asset.supplier} />
                        </div>
                    </div>

                    {asset.notes && (
                        <div>
                            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{t('asset_notes')}</div>
                            <p className="bg-muted/50 rounded-md px-3 py-2 text-sm">{asset.notes}</p>
                        </div>
                    )}

                    {asset.last_reason && (
                        <div>
                            <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                                {lang === 'th' ? 'เหตุผลล่าสุด' : 'Last reason'}
                            </div>
                            <p className="bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded-md px-3 py-2 text-sm">{asset.last_reason}</p>
                        </div>
                    )}
                </div>

                <SheetFooter className="mt-4 flex-row gap-2">
                    <Button variant="outline" className="flex-1" onClick={onClose}>
                        {t('close')}
                    </Button>
                    {canTransfer && asset.status === 'pending_return' && (
                        <Button className="flex-1" onClick={() => onReceive(asset)}>
                            <Check className="h-4 w-4" />
                            {t('asset_mark_received')}
                        </Button>
                    )}
                    {canTransfer && !blocked && asset.status !== 'pending_return' && (
                        <Button className="flex-1" onClick={() => onTransfer(asset)}>
                            <Share2 className="h-4 w-4" />
                            {t('transfer_asset')}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
