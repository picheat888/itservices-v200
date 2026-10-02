/**
 * "ระยะเวลาอนุมัติแต่ละขั้น" — /reports/requests-approval-time
 *
 * Report key requests.approval_time. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function RequestsApprovalTimeReportPage() {
    return <TabularReportView reportKey="requests.approval_time" />;
}
