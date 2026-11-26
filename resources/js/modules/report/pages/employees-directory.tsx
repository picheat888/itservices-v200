// "รายชื่อพนักงาน" report page (/reports/employees-directory): shared tabular body + status switch on the list heading and its own cells.
import { directoryCell, StatusSegments } from '../components/employee-directory-cells';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside another column's cell — kept in the rows and files. */
const INNER = ['section', 'phone'];

export default function EmployeesDirectoryReportPage() {
    return (
        <TabularReportView
            reportKey="employees.directory"
            extras={{
                tiles: 4,
                // สถานะ narrows only the list, so it sits on the list's heading and the tiles ignore it.
                hiddenFilters: ['status'],
                rowsOnlyFilters: ['status'],
                innerColumns: INNER,
                rowsLead: ({ filters, patch }) => <StatusSegments filters={filters} patch={patch} />,
                rowsTitle: 'rep_ed_rows_title',
                renderCell: directoryCell,
            }}
        />
    );
}
