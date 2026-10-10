// "การอนุมัติคำขอ" report page (/reports/requests-approvals): shared tabular body + RequestApprovalsCards + the step row cells.
import { APPROVAL_INNER_COLUMNS, approvalCell, RequestApprovalsCards } from '../components/request-approvals-cards';
import { TabularReportView } from '../components/tabular-report-view';

export default function RequestsApprovalsReportPage() {
    return (
        <TabularReportView
            reportKey="requests.approvals"
            extras={{
                tiles: 5,
                innerColumns: APPROVAL_INNER_COLUMNS,
                beforeTable: ({ filters }) => <RequestApprovalsCards filters={filters} />,
                rowsTitle: 'rep_rqa_rows_title',
                renderCell: approvalCell,
            }}
        />
    );
}
