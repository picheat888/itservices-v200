// "ภาพรวมและค่าใช้จ่ายสัญญา" report page (/reports/contracts-overview): shared tabular body + ContractOverviewCards + its own list cells.
import { useT } from '@/lang';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { ContractNameCell, TypePill } from '../components/contract-cells';
import { ContractLeftPill } from '../components/contract-left-pill';
import { ContractOverviewCards } from '../components/contract-overview-cards';
import { TabularReportView } from '../components/tabular-report-view';

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

function NextBillCell({ value }: { value: unknown }) {
    const t = useT();
    const fmt = useDateFormat();
    const date = str(value);
    return date ? (
        <span className="font-mono text-xs">{fmt.date(date)}</span>
    ) : (
        <span className="text-muted-foreground text-xs">{t('rep_cov_paid_up')}</span>
    );
}

/** The end date, and under it the time left. */
function EndCell({ row }: { row: Row }) {
    const fmt = useDateFormat();
    const days = typeof row.days_left === 'number' ? row.days_left : null;
    return (
        <div>
            <div className="font-mono text-xs">{fmt.date(str(row.end_date))}</div>
            {days !== null && (
                <div className="mt-0.5">
                    <ContractLeftPill days={days} inReminder={str(row.time_state) === 'reminder'} />
                </div>
            )}
        </div>
    );
}

function overviewCell(key: string, row: Row) {
    if (key === 'name') return <ContractNameCell name={str(row.name)} vendor={row.vendor as { name: string; name_th: string | null } | null} />;
    if (key === 'type') return <TypePill type={row.type} />;
    if (key === 'next_bill') return <NextBillCell value={row.next_bill} />;
    if (key === 'end_date') return <EndCell row={row} />;
    return undefined;
}

export default function ContractsOverviewReportPage() {
    return (
        <TabularReportView
            reportKey="contracts.overview"
            extras={{
                tiles: 5,
                // The page draws its own tiles from the breakdown, above its cards.
                hideSummary: true,
                innerColumns: ['vendor', 'days_left', 'time_state'],
                beforeTable: ({ filters }) => <ContractOverviewCards filters={filters} />,
                rowsTitle: 'rep_cov_rows_title',
                renderCell: overviewCell,
            }}
        />
    );
}
