import { useT } from '@/lang';
import { AssetDetailDrawer, AssetStatusBadge, assetApi } from '@/modules/asset';
import { type Column, DataTable } from '@/shared/components/data-table';
import { EmptyPane } from '@/shared/components/empty-pane';
import { StatusBadge } from '@/shared/components/status-badge';
import { localPair } from '@/shared/lib/local-name';
import { type Asset, type AssetStatus, type ContractLinkedAsset } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';

/** Assets tab: a fill-height data table of the contract's linked assets; a row opens the asset detail (read-only). */
export function ContractAssetsTab({ assets }: { assets: ContractLinkedAsset[] }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const [assetId, setAssetId] = useState<number | null>(null);

    // Linked assets carry only a subset of fields; fetch the full asset on demand for the detail drawer.
    const { data: asset } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: () => assetApi.get(assetId as number),
        enabled: assetId != null,
    });

    if (assets.length === 0) {
        return <EmptyPane icon={Package} text={t('contract_assets_empty')} />;
    }

    const columns: Column<ContractLinkedAsset>[] = [
        { key: 'asset_code', header: t('contract_asset_col_id'), render: (a) => <span className="text-xs">{a.asset_code}</span> },
        { key: 'name', header: t('contract_asset_col_name'), render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: t('contract_label_type'), render: (a) => localPair(a.type, a.type_th, lang) ?? '—' },
        { key: 'serial', header: t('contract_asset_col_serial'), render: (a) => <span className="text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: t('contract_asset_col_owner'), render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: t('contract_label_status'),
            // A return to the lessor is a write-off of its own kind; it says so.
            render: (a) =>
                a.returned_to_vendor ? (
                    <StatusBadge tone="gray">{t('contract_asset_returned_to_vendor')}</StatusBadge>
                ) : a.status ? (
                    <AssetStatusBadge status={a.status as AssetStatus} t={t} />
                ) : (
                    '—'
                ),
        },
    ];

    return (
        <div className="h-full">
            <DataTable
                fillHeight
                columns={columns}
                rows={assets}
                rowKey={(a) => a.id}
                searchable={(a) => `${a.asset_code} ${a.name} ${a.serial ?? ''}`}
                onRowClick={(a) => setAssetId(a.id)}
            />
            <AssetDetailDrawer
                asset={(asset as Asset) ?? null}
                onClose={() => setAssetId(null)}
                onTransfer={() => {}}
                onReceive={() => {}}
                canTransfer={false}
                canReceive={false}
            />
        </div>
    );
}
