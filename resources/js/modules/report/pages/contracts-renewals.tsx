// "ต่ออายุและสิ้นสุดสัญญา" report page (/reports/contracts-renewals): shared tabular body + renewal tiles, charts, list cells and closed contracts.
import {
    ClosedContractsCard,
    ContractRenewalsCards,
    RenewalsEmpty,
    RenewalsRowsInfo,
    renewalsCell,
    windowOf,
} from '../components/contract-renewals-cards';
import { TabularReportView } from '../components/tabular-report-view';

export default function ContractsRenewalsReportPage() {
    return (
        <TabularReportView
            reportKey="contracts.renewals"
            extras={{
                tiles: 5,
                // The tiles come from the breakdown, with their own units and footers.
                hideSummary: true,
                // "ปิดเมื่อ" narrows only the closed-contracts card.
                cardOnlyFilters: ['closed'],
                innerColumns: ['vendor'],
                beforeTable: ({ filters }) => <ContractRenewalsCards filters={filters} />,
                afterTable: ({ filters, patch }) => <ClosedContractsCard filters={filters} patch={patch} />,
                rowsTitle: (filters) => `rep_cren_rows_${windowOf(filters)}d`,
                rowsLead: () => <RenewalsRowsInfo />,
                emptyState: ({ filters, patch }) => <RenewalsEmpty filters={filters} patch={patch} />,
                renderCell: renewalsCell,
            }}
        />
    );
}
