import { type Column, DataTable } from '@/shared/components/data-table';
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import type { AssetTransferEntry } from '@/shared/types';
import { History } from 'lucide-react';

const POOL = 'Pool — IT';

/** Renders one custody endpoint, highlighting the IT pool. */
function Party({ name, muted }: { name: string | null; muted?: boolean }) {
    if (!name) {
        return <span className="text-muted-foreground">—</span>;
    }
    const isPool = name === POOL;
    return <span className={cn(isPool ? 'text-brand font-medium' : muted ? 'text-muted-foreground' : 'font-medium')}>{name}</span>;
}

/**
 * History tab: an asset's custody trail (ownership transfers + returns-to-pool),
 * rendered as a fill-height table that paginates with Prev/Next.
 */
export function AssetHistoryTab({ transfers }: { transfers: AssetTransferEntry[] }) {
    const t = useT();

    if (transfers.length === 0) {
        return (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-sm">
                <History className="text-muted-foreground/50 h-8 w-8" />
                <div>{t('asset_history_empty')}</div>
                <div className="text-xs">{t('asset_history_empty_hint')}</div>
            </div>
        );
    }

    const columns: Column<AssetTransferEntry>[] = [
        {
            key: 'date',
            header: t('asset_hist_date'),
            render: (r) => <span className="text-muted-foreground font-mono text-xs">{r.date ?? '—'}</span>,
        },
        {
            key: 'flow',
            header: t('asset_hist_flow'),
            render: (r) => (
                <span className="inline-flex items-center gap-2 text-sm">
                    <Party name={r.from_owner} muted />
                    <span className="text-muted-foreground/60">→</span>
                    <Party name={r.to_owner} />
                </span>
            ),
        },
        { key: 'reason', header: t('asset_hist_reason'), render: (r) => <span className="text-sm">{r.reason ?? '—'}</span> },
        { key: 'by', header: t('asset_hist_by'), render: (r) => <span className="text-sm">{r.performed_by ?? '—'}</span> },
    ];

    return (
        <div className="h-full">
            <DataTable fillHeight columns={columns} rows={transfers} rowKey={(r) => r.id} />
        </div>
    );
}
