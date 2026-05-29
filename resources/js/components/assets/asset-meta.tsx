import { StatusBadge } from '@/components/shared/status-badge';
import { useUiStore } from '@/stores/ui';
import type { AssetStatus, AssetType } from '@/types';
import { Box, Laptop, Monitor, Network, Printer, Server, Smartphone } from 'lucide-react';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';

/** Status → badge tone + i18n label key. */
export const ASSET_STATUS_META: Record<AssetStatus, { tone: Tone; key: string }> = {
    deployed: { tone: 'green', key: 'asset_deployed' },
    ready: { tone: 'blue', key: 'asset_ready' },
    pending_acceptance: { tone: 'amber', key: 'asset_pending_accept' },
    pending_return: { tone: 'amber', key: 'asset_pending_return' },
    maintenance: { tone: 'violet', key: 'asset_maintenance' },
    writeoff: { tone: 'gray', key: 'asset_writeoff' },
    pending_stock: { tone: 'violet', key: 'asset_pending_stock' },
};

/** Coloured badge for an asset's lifecycle status (color is system-wide, set in Settings -> Assets). */
export function AssetStatusBadge({ status, t }: { status: AssetStatus; t: (k: string) => string }) {
    const meta = ASSET_STATUS_META[status] ?? { tone: 'gray' as Tone, key: status };
    const color = useUiStore((s) => s.assetStatusColors[status]);
    return <StatusBadge tone={meta.tone} color={color}>{t(meta.key)}</StatusBadge>;
}

const TYPE_ICON: Record<AssetType, typeof Box> = {
    laptop: Laptop,
    desktop: Monitor,
    mobile: Smartphone,
    printer: Printer,
    server: Server,
    network: Network,
    other: Box,
};

/** Lucide icon for an asset type. */
export function AssetTypeIcon({ type, className }: { type: AssetType; className?: string }) {
    const Icon = TYPE_ICON[type] ?? Box;
    return <Icon className={className} />;
}

export const ASSET_TYPES: AssetType[] = ['laptop', 'desktop', 'mobile', 'printer', 'server', 'network', 'other'];
