import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import type { AssetTransferEntry } from '@/shared/types';
import { ArrowDownLeft, ArrowUpRight, MapPin, Undo2 } from 'lucide-react';

type TransferKind = NonNullable<AssetTransferEntry['kind']>;

/**
 * What a row of the custody trail actually was. The kind is recorded on the row itself, so it
 * is stated rather than left to be inferred from the free-text reason — which is the whole
 * reason `AssetTransferKind` exists.
 *
 * Tones borrow the vocabulary the other asset tables already use: blue = on its way out to
 * someone, green = safely back in the pool, amber = a hand-over pulled back before anyone
 * accepted it, grey = a correction that changed no hands.
 */
const EVENT_META: Record<TransferKind, { Icon: typeof MapPin; tone: 'blue' | 'green' | 'amber' | 'gray'; key: string }> = {
    handover: { Icon: ArrowUpRight, tone: 'blue', key: 'asset_hist_kind_handover' },
    return: { Icon: ArrowDownLeft, tone: 'green', key: 'asset_hist_kind_return' },
    recall: { Icon: Undo2, tone: 'amber', key: 'asset_hist_kind_recall' },
    relocate: { Icon: MapPin, tone: 'gray', key: 'asset_hist_kind_relocate' },
};

/** Shared by the asset's own History tab and the cross-asset Transfer log. */
export function AssetEventBadge({ kind }: { kind: AssetTransferEntry['kind'] }) {
    const t = useT();
    const meta = kind ? EVENT_META[kind] : null;

    if (!meta) {
        return <span className="text-muted-foreground">—</span>;
    }

    return (
        <StatusBadge tone={meta.tone} dot={false} className="gap-1 px-2 py-0 text-[11px]">
            <meta.Icon className="h-3 w-3" />
            {t(meta.key)}
        </StatusBadge>
    );
}
