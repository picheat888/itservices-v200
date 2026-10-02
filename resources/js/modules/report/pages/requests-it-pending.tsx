/**
 * "คำขอที่รอดำเนินการโดย IT" — /reports/requests-it-pending
 *
 * Report key requests.it_pending. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function RequestsItPendingReportPage() {
    return <TabularReportView reportKey="requests.it_pending" />;
}
