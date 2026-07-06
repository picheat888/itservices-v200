import { useCategories } from '@/modules/settings';
import { StatusBadge, ToneDot } from '@/shared/components/status-badge';
import { getLucideIcon } from '@/shared/lib/lucide-icons';
import type { AssetStatus, AssetType } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { Box, Laptop, Monitor, Network, Printer, Server, Smartphone } from 'lucide-react';

type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray';

/** Status → badge tone + i18n label key. */
export const ASSET_STATUS_META: Record<AssetStatus, { tone: Tone; key: string }> = {
    deployed: { tone: 'green', key: 'asset_deployed' },
    ready: { tone: 'blue', key: 'asset_ready' },
    pending_acceptance: { tone: 'amber', key: 'asset_pending_accept' },
    pending_return: { tone: 'amber', key: 'asset_pending_return' },
    writeoff: { tone: 'gray', key: 'asset_writeoff' },
};

/** Coloured badge for an asset's lifecycle status (color is system-wide, set in Settings -> Assets). */
export function AssetStatusBadge({ status, t }: { status: AssetStatus; t: (k: string) => string }) {
    const meta = ASSET_STATUS_META[status] ?? { tone: 'gray' as Tone, key: status };
    const color = useUiStore((s) => s.assetStatusColors[status]);
    return (
        <StatusBadge tone={meta.tone} color={color}>
            {t(meta.key)}
        </StatusBadge>
    );
}

/** Small colored dot for an asset status — same color as AssetStatusBadge
 *  (custom color from Settings -> Assets wins over the named tone). */
export function AssetStatusDot({ status }: { status: AssetStatus }) {
    const meta = ASSET_STATUS_META[status] ?? { tone: 'gray' as Tone, key: status };
    const color = useUiStore((s) => s.assetStatusColors[status]);
    if (color) {
        return <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
    }
    return <ToneDot tone={meta.tone} />;
}

// Legacy fallback for assets registered before types moved to Master Data
// (their type is a bare enum value like "laptop"), so old rows keep a matching icon.
const LEGACY_ICON: Record<string, typeof Box> = {
    laptop: Laptop,
    desktop: Monitor,
    mobile: Smartphone,
    printer: Printer,
    server: Server,
    network: Network,
    other: Box,
};

/**
 * Icon for an asset type. Types are Master Data categories now, so the icon comes
 * from the matching category's `icon` field (a Lucide name). Falls back to a legacy
 * icon for pre-migration values, then a generic box.
 */
export function AssetTypeIcon({ type, className }: { type: AssetType; className?: string }) {
    const { data: categories = [] } = useCategories();
    const iconName = categories.find((c) => c.name === type)?.icon;
    const Icon = getLucideIcon(iconName) ?? LEGACY_ICON[type] ?? Box;
    return <Icon className={className} />;
}
