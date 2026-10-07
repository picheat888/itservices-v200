// "ประวัติโอนย้ายและรับคืน" report page (/reports/assets-transfer-history): shared tabular body + TransferCards + its own list cells.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { TabularReportView } from '../components/tabular-report-view';
import { KindMark, spanText, TransferCards, type TransferKind } from '../components/transfer-cards';
import { useCanOpen } from '../hooks/use-can-open';
import type { ChartLabel, TabularFilters } from '../types';

type Row = Record<string, unknown> & { _links?: Record<string, string> };
type Patch = (next: TabularFilters) => void;

const KINDS: TransferKind[] = ['handover', 'return', 'recall', 'relocate'];

/** Columns drawn inside the asset, from / to and outcome cells — kept in the rows and files. */
const INNER = [
    'model',
    'category',
    'asset_moves',
    ...['from', 'to'].flatMap((end) => [`${end}_type`, `${end}_name`, `${end}_code`, `${end}_department`, `${end}_resigned`]),
    'outcome_hours',
];

/** A wait longer than this many hours (a week) is flagged. */
const LONG_WAIT_HOURS = 7 * 24;

const CODE_LINK =
    'text-brand focus-visible:ring-brand rounded-sm font-mono text-xs font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none';

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const isLabel = (v: unknown): v is ChartLabel => typeof v === 'object' && v !== null && 'name' in v;

function None() {
    return <span className="text-muted-foreground">—</span>;
}

function AssetCell({ row, patch }: { row: Row; patch: Patch }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const canOpen = useCanOpen();
    const href = row._links?.asset_code;
    const code = String(row.asset_code ?? '');
    const category = isLabel(row.category) ? (lang === 'th' && row.category.name_th) || row.category.name : null;
    const what = [str(row.model), category].filter((s): s is string => Boolean(s));
    const moves = num(row.asset_moves) ?? 0;

    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                {href && canOpen(href) ? (
                    <Link to={href} className={CODE_LINK} translate="no">
                        {code}
                    </Link>
                ) : (
                    <span className="font-mono text-xs font-semibold" translate="no">
                        {code}
                    </span>
                )}
                {moves > 1 && (
                    // Narrows the list to this asset: its whole journey.
                    <button
                        type="button"
                        onClick={() => patch({ search: code, kind: null })}
                        aria-label={t('rep_th_trips_aria').replace('{code}', code).replace('{n}', String(moves))}
                        className="border-border text-brand hover:bg-brand/10 focus-visible:ring-brand rounded-full border px-2 py-px text-[11px] font-semibold focus-visible:ring-2 focus-visible:outline-none"
                    >
                        {t('rep_th_trips').replace('{n}', String(moves))}
                    </button>
                )}
            </div>
            {what.length > 0 && (
                <div className="text-muted-foreground flex max-w-[16rem] gap-x-3 text-xs" title={what.join('\n')}>
                    {what.map((part) => (
                        <span key={part} className="truncate">
                            {part}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function KindCell({ kind }: { kind: unknown }) {
    const t = useT();
    if (!KINDS.includes(kind as TransferKind)) return <None />;
    return (
        <span className="bg-muted text-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
            <KindMark kind={kind as TransferKind} />
            {t(`asset_hist_kind_${kind as string}`)}
        </span>
    );
}

/** One end of a move: the name, then what it is (code and department, "คลัง", "ใช้ร่วม"). */
function PartyCell({ row, end }: { row: Row; end: 'from' | 'to' }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const type = str(row[`${end}_type`]);
    const name = str(row[`${end}_name`]);
    if (!type || !name) return <None />;
    const department = row[`${end}_department`];
    const sub = (
        type === 'employee'
            ? [
                  str(row[`${end}_code`]),
                  isLabel(department) ? (lang === 'th' && department.name_th) || department.name : null,
                  row[`${end}_resigned`] === 1 ? t('rep_th_resigned') : null,
              ]
            : [t(`rep_th_party_${type}`)]
    ).filter((s): s is string => Boolean(s));

    return (
        <div className="min-w-0">
            <div className={cn('max-w-[14rem] truncate', type === 'employee' && 'font-medium')} title={name}>
                {name}
            </div>
            <div className="text-muted-foreground flex max-w-[14rem] gap-x-3 text-xs" title={sub.join('\n')}>
                {sub.map((part) => (
                    <span key={part} className="truncate">
                        {part}
                    </span>
                ))}
            </div>
        </div>
    );
}

/** What became of the move: accepted in N, still waiting, recalled, returned N after it was asked back. */
function OutcomeCell({ row }: { row: Row }) {
    const t = useT();
    const hours = num(row.outcome_hours);
    switch (row.outcome) {
        case 'accepted':
            return <span>{hours === null ? t('rep_th_outcome_accepted') : t('rep_th_out_accepted').replace('{d}', spanText(t, hours))}</span>;
        case 'waiting':
            return (
                <StatusBadge tone={hours !== null && hours > LONG_WAIT_HOURS ? 'red' : 'gray'}>
                    {hours === null ? t('rep_th_outcome_waiting') : t('rep_th_out_waiting').replace('{d}', spanText(t, hours))}
                </StatusBadge>
            );
        case 'returned':
            return <span>{hours === null ? t('rep_th_outcome_returned') : t('rep_th_out_returned').replace('{d}', spanText(t, hours))}</span>;
        case 'recalled':
        case 'never_accepted':
            return <span>{t(`rep_th_outcome_${row.outcome}`)}</span>;
        case 'not_needed':
            return <span className="text-muted-foreground">{t('rep_th_outcome_not_needed')}</span>;
        default:
            return <None />;
    }
}

function ReasonCell({ reason }: { reason: unknown }) {
    const text = str(reason);
    return text ? (
        <span className="block max-w-[14rem] truncate" title={text}>
            {text}
        </span>
    ) : (
        <None />
    );
}

function transferCell(key: string, row: Row, { patch }: { patch: Patch }) {
    if (key === 'asset_code') return <AssetCell row={row} patch={patch} />;
    if (key === 'transfer_kind') return <KindCell kind={row.transfer_kind} />;
    if (key === 'from_label') return <PartyCell row={row} end="from" />;
    if (key === 'to_label') return <PartyCell row={row} end="to" />;
    if (key === 'outcome') return <OutcomeCell row={row} />;
    if (key === 'reason') return <ReasonCell reason={row.reason} />;
    return undefined;
}

export default function AssetsTransferHistoryReportPage() {
    return (
        <TabularReportView
            reportKey="assets.transfer_history"
            extras={{
                tiles: 5,
                innerColumns: INNER,
                beforeTable: ({ filters }) => <TransferCards filters={filters} />,
                rowsTitle: 'rep_th_rows_title',
                renderCell: transferCell,
            }}
        />
    );
}
