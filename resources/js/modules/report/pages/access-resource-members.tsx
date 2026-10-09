// "ตรวจสอบสมาชิกและเจ้าของ" report page (/reports/access-resource-members): shared tabular body + AccessMembersCards + the access member cells.
import { type AccessRow, DepartmentCell, EmployeeCell, LevelCell, ResourceCell, StatusCell } from '../components/access-cells';
import { AccessMembersCards, AccessMembersListLead, AccessMembersTypeSegments, PickedResourceHead } from '../components/access-members-cards';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside the resource, employee, department and status cells — kept in the rows and files. */
const INNER = ['resource_type', 'resource_code', 'resource_detail', 'resource_department', 'employee_code', 'left_days', 'revoked_at', 'revoked_by'];

function memberCell(key: string, row: AccessRow) {
    if (key === 'resource') return <ResourceCell row={row} withType />;
    if (key === 'employee') return <EmployeeCell row={row} />;
    if (key === 'department') return <DepartmentCell row={row} />;
    if (key === 'level') return <LevelCell level={row.level} />;
    if (key === 'status') return <StatusCell row={row} />;
    return undefined;
}

export default function AccessResourceMembersReportPage() {
    return (
        <TabularReportView
            reportKey="access.resource_members"
            extras={{
                tiles: 5,
                // Type as segments in the bar; the picked resource, the list's segment and its order sit on the list's heading.
                hiddenFilters: ['type', 'resource', 'state', 'sort'],
                innerColumns: INNER,
                filterLead: ({ filters, patch }) => <AccessMembersTypeSegments filters={filters} patch={patch} />,
                rowsLead: ({ filters, patch }) => <AccessMembersListLead filters={filters} patch={patch} />,
                rowsHead: ({ filters, patch }) => (filters.resource ? <PickedResourceHead filters={filters} patch={patch} /> : null),
                beforeTable: ({ filters, patch }) => <AccessMembersCards filters={filters} patch={patch} />,
                rowsTitle: 'rep_ar_rows_title',
                rowClassName: (row) => (row.status === 'left' ? 'bg-red-500/5' : undefined),
                renderCell: memberCell,
            }}
        />
    );
}
