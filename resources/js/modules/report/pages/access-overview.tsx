// "ภาพรวมสิทธิ์การเข้าถึง" report page (/reports/access-overview): shared tabular body + AccessOverviewCards + the access register cells.
import { type AccessRow, EmployeeCell, LevelCell, ResourceCell, StatusCell, TypeCell } from '../components/access-cells';
import { AccessOverviewCards, AccessStateSegments, AccessTypeSegments } from '../components/access-overview-cards';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside the employee, resource and status cells — kept in the rows and files. */
const INNER = ['employee_code', 'resource_code', 'resource_detail', 'resource_department', 'left_days', 'revoked_at', 'revoked_by'];

function accessCell(key: string, row: AccessRow) {
    if (key === 'employee') return <EmployeeCell row={row} />;
    if (key === 'resource') return <ResourceCell row={row} />;
    if (key === 'resource_type') return <TypeCell type={row.resource_type} />;
    if (key === 'level') return <LevelCell level={row.level} />;
    if (key === 'status') return <StatusCell row={row} />;
    return undefined;
}

export default function AccessOverviewReportPage() {
    return (
        <TabularReportView
            reportKey="access.overview"
            extras={{
                tiles: 5,
                // The type filter sits at the head of the bar as segments; active / revoked narrows only the register.
                hiddenFilters: ['type', 'state'],
                innerColumns: INNER,
                rowsOnlyFilters: ['search'],
                filterLead: ({ filters, patch }) => <AccessTypeSegments filters={filters} patch={patch} />,
                rowsLead: ({ filters, patch }) => <AccessStateSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <AccessOverviewCards filters={filters} />,
                rowsTitle: 'rep_ac_rows_title',
                rowClassName: (row) => (row.status === 'left' ? 'bg-red-500/5' : undefined),
                renderCell: accessCell,
            }}
        />
    );
}
