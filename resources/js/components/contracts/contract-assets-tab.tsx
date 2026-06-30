import { AssetDetailDrawer } from '@/components/assets/asset-detail-drawer';
import { StatusBadge } from '@/components/shared/status-badge';
import { type Column, DataTable } from '@/components/shared/data-table';
import { useT } from '@/lib/i18n';
import { assetApi } from '@/services/assetApi';
import { useUiStore } from '@/stores/ui';
import { type Asset, type ContractLinkedAsset } from '@/types';
import { useQuery } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';

/** Asset status → StatusBadge tone for the linked-assets table. */
const ASSET_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'gray'> = {
    deployed: 'blue',
    ready: 'green',
    pending_acceptance: 'amber',
    pending_return: 'amber',
    maintenance: 'amber',
    writeoff: 'red',
};

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
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-sm">
                <Package className="text-muted-foreground/50 h-8 w-8" />
                {lang === 'th' ? 'สัญญานี้ยังไม่ได้ผูกทรัพย์สิน' : 'No assets linked to this contract'}
            </div>
        );
    }

    const columns: Column<ContractLinkedAsset>[] = [
        { key: 'tag', header: 'Tag', render: (a) => <span className="font-mono text-xs">{a.tag}</span> },
        { key: 'name', header: lang === 'th' ? 'ชื่อ' : 'Name', render: (a) => <span className="font-medium">{a.name}</span> },
        { key: 'type', header: lang === 'th' ? 'ประเภท' : 'Type', render: (a) => a.type ?? '—' },
        { key: 'serial', header: 'Serial', render: (a) => <span className="font-mono text-xs">{a.serial ?? '—'}</span> },
        { key: 'owner', header: lang === 'th' ? 'เจ้าของ' : 'Owner', render: (a) => a.owner ?? '—' },
        {
            key: 'status',
            header: lang === 'th' ? 'สถานะ' : 'Status',
            render: (a) =>
                a.status ? <StatusBadge tone={ASSET_TONE[a.status] ?? 'gray'}>{a.status.replace(/_/g, ' ')}</StatusBadge> : '—',
        },
    ];

    return (
        <div className="h-full">
            <DataTable
                fillHeight
                columns={columns}
                rows={assets}
                rowKey={(a) => a.id}
                searchable={(a) => `${a.tag} ${a.name} ${a.serial ?? ''}`}
                onRowClick={(a) => setAssetId(a.id)}
            />
            <AssetDetailDrawer
                asset={(asset as Asset) ?? null}
                onClose={() => setAssetId(null)}
                onTransfer={() => {}}
                onReceive={() => {}}
                canTransfer={false}
            />
        </div>
    );
}
