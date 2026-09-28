import { useT } from '@/lang';
import { AssetDetailDrawer, assetApi } from '@/modules/asset';
import { type Column, DataTable } from '@/shared/components/data-table';
import { StatusBadge } from '@/shared/components/status-badge';
import { type Asset, type ContractLinkedAsset } from '@/shared/types';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';

/** Asset status → StatusBadge tone for the linked-assets table. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    writeoff: 'red',
};

/** Assets tab: a fill-height data table of the contract's linked assets; a row opens the asset detail (read-only). */
export function ContractAssetsTab({ assets }: { assets: ContractLinkedAsset[] }) {
    const t = useT();
    const [assetId, setAssetId] = useState<number | null>(null);

    // Linked assets carry only a subset of fields; fetch the full asset on demand for the detail drawer.
    const { data: asset } = useQuery({
        queryKey: ['asset', assetId],
        queryFn: () => assetApi.get(assetId as number),
        enabled: assetId != null,
    });

    if (assets.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <Package className="text-muted-foreground/50 h-8 w-8" />
                {t('contract_assets_empty')}
            </div>
        );
    }

    const columns: Column<ContractLinkedAsset>[] = [
        { key: 'asset_code', header: t('contract_asset_col_id'), render: (a) => <span className="font-mono text-xs">{a.asset_code}</span> },
        { key: 'name', header: t('contract_asset_col_name'), render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: t('contract_label_type'), render: (a) => a.type ?? '—' },
        { key: 'serial', header: t('contract_asset_col_serial'), render: (a) => <span className="font-mono text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: t('contract_asset_col_owner'), render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: t('contract_label_status'),
            render: (a) => (a.status ? <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge> : '—'),
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
