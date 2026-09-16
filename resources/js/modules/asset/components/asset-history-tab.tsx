import { useT } from '@/lang';
import { type Column, DataTable } from '@/shared/components/data-table';
import type { AssetTransferEntry } from '@/shared/types';
import { History } from 'lucide-react';
import { AssetEventBadge } from './asset-event-badge';

/**
 * One end of a move. The trail stores an employee code, a warehouse name or a shared label in
 * the same field; a code the API resolved shows as the person's name instead — the code is
 * the system's way of naming them, not the reader's.
 */
export function Party({ label, name, muted }: { label: string | null; name: string | null; muted?: boolean }) {
    const text = name ?? label;
    if (!text) {
        return <span className="text-muted-foreground">—</span>;
    }
    return <span className={muted ? 'text-muted-foreground text-[13px]' : 'text-[13px] font-medium'}>{text}</span>;
}

/**
 * History tab: everything that happened to one asset — hand-overs, returns to the pool and
 * location corrections — as a table that paginates with Prev/Next.
 */
export function AssetHistoryTab({ transfers, loading }: { transfers: AssetTransferEntry[]; loading?: boolean }) {
    const t = useT();

    const columns: Column<AssetTransferEntry>[] = [
        {
            key: 'date',
            header: t('asset_hist_date'),
            render: (r) => <span className="text-muted-foreground font-mono text-[11px] whitespace-nowrap">{r.date ?? '—'}</span>,
        },
        { key: 'event', header: t('asset_hist_event'), render: (r) => <AssetEventBadge kind={r.kind} /> },
        // From and To stand in their own columns so the whole trail lines up vertically —
        // reading down one column answers "who had it before" without re-parsing each row.
        { key: 'from', header: t('asset_hist_from'), render: (r) => <Party label={r.from_owner} name={r.from_name} muted /> },
        { key: 'to', header: t('asset_hist_to'), render: (r) => <Party label={r.to_owner} name={r.to_name} /> },
        { key: 'reason', header: t('asset_hist_reason'), render: (r) => <span className="text-[13px]">{r.reason ?? '—'}</span> },
        { key: 'by', header: t('asset_hist_by'), render: (r) => <span className="text-muted-foreground text-[13px]">{r.performed_by ?? '—'}</span> },
    ];

    return (
        <div className="flex h-full flex-col gap-3">
            {/* Table title + what this history means */}
            <div>
                <div className="text-foreground text-sm font-semibold">{t('asset_history_title')}</div>
                <p className="text-muted-foreground text-xs">{t('asset_history_desc')}</p>
            </div>

            {/* "No history" is a claim about the asset, so it waits until this asset's
                trail has actually arrived — until then the table shows loading rows. */}
            {transfers.length === 0 && !loading ? (
                <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm">
                    <History className="text-muted-foreground/50 h-8 w-8" />
                    <div>{t('asset_history_empty')}</div>
                    <div className="text-xs">{t('asset_history_empty_hint')}</div>
                </div>
            ) : (
                // fillHeight, like the repair-tickets tab: rows-per-page is derived from the
                // space the tab actually has, so a two-row trail leaves no field of blank filler
                // rows and a long one fills the panel. rowHeight tells it how tall these rows
                // are — denser than the shell's density setting, the way the employee drawer's
                // tables do it, because a trail is scanned rather than read.
                <div className="min-h-0 flex-1 [--row-py:0.3125rem]">
                    <DataTable fillHeight rowHeight={32} columns={columns} rows={transfers} rowKey={(r) => r.id} loading={loading} />
                </div>
            )}
        </div>
    );
}
