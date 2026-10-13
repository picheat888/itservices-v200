// "ภาพรวมพนักงาน" report page (/reports/employees-overview): shared tabular body + headcount, department and leaver cards, and the joiner / leaver list.
import {
    DepartmentCell,
    EmployeeCell,
    EmployeeOverviewCards,
    HeldCell,
    KindCell,
    KindSegments,
    LastDayCell,
    PrepCell,
} from '../components/employee-overview-cards';
import { TabularReportView } from '../components/tabular-report-view';

/** Columns drawn inside another column's cell — kept in the rows and files. */
const INNER = ['employee_code', 'section', 'onboarding', 'upcoming_days'];

function overviewCell(key: string, row: Record<string, unknown>) {
    if (key === 'movement_kind') return <KindCell row={row} />;
    if (key === 'last_day') return <LastDayCell row={row} />;
    if (key === 'employee') return <EmployeeCell row={row} />;
    if (key === 'department') return <DepartmentCell row={row} />;
    if (key === 'prep_status') return <PrepCell row={row} />;
    if (key === 'assets_held' || key === 'open_grants') return <HeldCell row={row} column={key} />;
    return undefined;
}

export default function EmployeesOverviewReportPage() {
    return (
        <TabularReportView
            reportKey="employees.overview"
            extras={{
                tiles: 5,
                // รายการ narrows only the list, so it sits on the list's heading.
                hiddenFilters: ['kind'],
                innerColumns: INNER,
                rowsLead: ({ filters, patch }) => <KindSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <EmployeeOverviewCards filters={filters} />,
                rowsTitle: 'rep_eo_rows_title',
                renderCell: overviewCell,
            }}
        />
    );
}
