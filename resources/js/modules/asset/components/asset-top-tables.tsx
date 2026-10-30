// Overview tab: the five dearest bought assets and the five open leases with the highest rent, side by side.
import { useT } from '@/lang';
import { EmptyState } from '@/shared/components/empty-state';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { perCycle } from '@/shared/lib/currency';
import { localPair } from '@/shared/lib/local-name';
import { CARD_HEADING, TABLE_HEAD } from '@/shared/lib/surface';
import { cn } from '@/shared/lib/utils';
import type { Asset, AssetTopLease } from '@/shared/types';
import { Card } from '@/shared/ui/card';
import { useUiStore } from '@/stores/ui';
import { FileText, TrendingUp, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ContractPeekDialog } from './contract-peek-dialog';

const HEAD_ROW = 'border-border text-muted-foreground border-b text-left text-[11.5px] font-semibold tracking-wide uppercase';
const CODE_BUTTON =
    'text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-xs underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-hidden';

function TopCard({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children: ReactNode }) {
    return (
        <Card className="overflow-hidden">
            <div className={cn(CARD_HEADING, 'border-border flex items-center gap-2 border-b px-5 py-3.5')}>
                <Icon className="text-muted-foreground h-4 w-4" aria-hidden="true" />
                <h2 id={id} className="text-sm font-semibold">
                    {title}
                </h2>
            </div>
            {children}
        </Card>
    );
}

export function TopPurchasedCard({ assets, onOpen }: { assets: Asset[]; onOpen: (asset: Asset) => void }) {
    const t = useT();

    return (
        <TopCard id="asset-top-purchased-title" icon={TrendingUp} title={t('asset_top_purchased')}>
            {assets.length === 0 ? (
                <EmptyState kind="empty" title={t('asset_top_purchased_empty')} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-labelledby="asset-top-purchased-title">
                        <thead>
                            <tr className={cn(TABLE_HEAD, HEAD_ROW)}>
                                <th className="px-3 py-2">{t('asset_tag')}</th>
                                <th className="px-3 py-2">{t('asset_model')}</th>
                                <th className="px-3 py-2 text-right">{t('asset_purchase_price')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {assets.map((a) => (
                                <tr key={a.id} className="row-hover border-border/60 cursor-pointer border-b last:border-0" onClick={() => onOpen(a)}>
                                    {/* Row click is mouse-only; the code button is the keyboard way in */}
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onOpen(a);
                                            }}
                                            aria-label={`${t('asset_open_detail')} ${a.asset_code}`}
                                            className={CODE_BUTTON}
                                        >
                                            {a.asset_code}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 font-medium">{a.model}</td>
                                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{a.value_display}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </TopCard>
    );
}

export function TopRentedCard({ leases }: { leases: AssetTopLease[] }) {
    const t = useT();
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    const [peekAssetId, setPeekAssetId] = useState<number | null>(null);

    return (
        <TopCard id="asset-top-rented-title" icon={FileText} title={t('asset_top_rented')}>
            {leases.length === 0 ? (
                <EmptyState kind="empty" title={t('asset_top_rented_empty')} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" aria-labelledby="asset-top-rented-title">
                        <thead>
                            <tr className={cn(TABLE_HEAD, HEAD_ROW)}>
                                <th className="px-3 py-2">{t('contract_code')}</th>
                                <th className="px-3 py-2">{t('contract_vendor')}</th>
                                <th className="px-3 py-2 text-right">{t('contract_tab_assets')}</th>
                                <th className="px-3 py-2 text-right">{t('contract_value_per_cycle')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leases.map((lease) => (
                                <tr
                                    key={lease.contract_id}
                                    className="row-hover border-border/60 cursor-pointer border-b last:border-0"
                                    onClick={() => setPeekAssetId(lease.asset_id)}
                                >
                                    {/* Row click is mouse-only; the code button is the keyboard way in */}
                                    <td className="px-3 py-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPeekAssetId(lease.asset_id);
                                            }}
                                            aria-label={`${t('asset_view_contract')} ${lease.code}`}
                                            className={CODE_BUTTON}
                                        >
                                            {lease.code}
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 font-medium">{localPair(lease.vendor, lease.vendor_th, lang) ?? '—'}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                        {t('asset_top_rented_units').replace('{n}', fmtN(lease.assets_count))}
                                    </td>
                                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap tabular-nums">
                                        {perCycle(lease.value_display, lease.billing_cycle, t)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <ContractPeekDialog assetId={peekAssetId} onClose={() => setPeekAssetId(null)} />
        </TopCard>
    );
}
