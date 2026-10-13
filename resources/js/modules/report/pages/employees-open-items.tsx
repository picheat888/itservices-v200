// "สรุปเรื่องค้างของพนักงาน" report page (/reports/employees-open-items): shared tabular body + topic segments, tiles and cards.
import { EmployeeOpenItemsCards, OpenItemsTopicSegments } from '../components/employee-open-items-cards';
import { TabularReportView } from '../components/tabular-report-view';

export default function EmployeesOpenItemsReportPage() {
    return (
        <TabularReportView
            reportKey="employees.open_items"
            extras={{
                tiles: 5,
                hideSummary: true,
                // The topic picks which cards show; department and search narrow the cards and the tiles.
                hiddenFilters: ['group'],
                filterLead: ({ filters, patch }) => <OpenItemsTopicSegments filters={filters} patch={patch} />,
                beforeTable: ({ filters }) => <EmployeeOpenItemsCards filters={filters} />,
            }}
        />
    );
}
