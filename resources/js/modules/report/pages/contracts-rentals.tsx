// "สัญญาเช่าและทรัพย์สิน" report page (/reports/contracts-rentals): shared tabular body + scope segments, tiles, cards and its own list cells.
import { useT } from '@/lang';
import { AssetStatusBadge } from '@/modules/asset';
import type { AssetStatus } from '@/shared/types';
import { useUiStore } from '@/stores/ui';
import { ContractRentalsCards, LeftPill, RentalsListSegments, RentalsScopeSegments, SourcePill } from '../components/contract-rentals-cards';
import { TabularReportView } from '../components/tabular-report-view';
import type { ContractRentalState } from '../types';

type Row = Record<string, unknown>;
type Label = { name?: string | null; name_th?: string | null } | null;

const str = (v: unknown) => (typeof v === 'string' && v !== '' && v !== '—' ? v : null);

/** Brand and model on one line ("Dell Latitude 5440"), the category under it. */
function ModelCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const text = [str(row.brand), str(row.model)].filter(Boolean).join(' ');
    const category = row.category as Label;
    const sub = category ? (lang === 'th' && category.name_th) || category.name : null;

    return (
        <div className="min-w-0">
            <div className="max-w-[16rem] truncate" title={text || undefined} translate="no">
                {text || <span className="text-muted-foreground">—</span>}
            </div>
            {sub && <div className="text-muted-foreground max-w-[16rem] truncate text-xs">{sub}</div>}
        </div>
    );
}

/** The holder, with their department under it. */
function HolderCell({ row }: { row: Row }) {
    const lang = useUiStore((s) => s.lang);
    const holder = str(row.holder);
    if (!holder) return <span className="text-muted-foreground">—</span>;
    const department = row.department as Label;
    const sub = department ? (lang === 'th' && department.name_th) || department.name : null;

    return (
        <div className="min-w-0">
            <div className="max-w-[14rem] truncate" title={holder}>
                {holder}
            </div>
            {sub && <div className="text-muted-foreground max-w-[14rem] truncate text-xs">{sub}</div>}
        </div>
    );
}

function StatusCell({ row }: { row: Row }) {
    const t = useT();
    return row.status ? <AssetStatusBadge status={row.status as AssetStatus} t={t} /> : <span className="text-muted-foreground">—</span>;
}

function rentalsCell(key: string, row: Row) {
    if (key === 'model') return <ModelCell row={row} />;
    if (key === 'holder') return <HolderCell row={row} />;
    if (key === 'status') return <StatusCell row={row} />;
    if (key === 'source') return row.source ? <SourcePill kind={row.source === 'rented' ? 'rent' : 'buy'} /> : undefined;
    if (key === 'days_left' && row.contract_state) {
        return <LeftPill state={row.contract_state as ContractRentalState} days={typeof row.days_left === 'number' ? row.days_left : null} />;
    }
    return undefined;
}

export default function ContractsRentalsReportPage() {
    return (
        <TabularReportView
            reportKey="contracts.rentals"
            extras={{
                tiles: 5,
                hideSummary: true,
                // The scope sits in the bar as segments; the "must go back" switch narrows only the list.
                hiddenFilters: ['scope', 'list'],
                innerColumns: ['category', 'brand', 'department', 'contract_state'],
                filterLead: ({ filters, patch }) => <RentalsScopeSegments filters={filters} patch={patch} />,
                rowsLead: ({ filters, patch }) => <RentalsListSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <ContractRentalsCards filters={filters} />,
                rowsTitle: 'rep_crent_rows_title',
                renderCell: rentalsCell,
            }}
        />
    );
}
