// "การอนุมัติคำขอ" report page (/reports/requests-approvals): the shared tabular body until its cards are built.
import { TabularReportView } from '../components/tabular-report-view';

export default function RequestsApprovalsReportPage() {
    return <TabularReportView reportKey="requests.approvals" extras={{ tiles: 5 }} />;
}
