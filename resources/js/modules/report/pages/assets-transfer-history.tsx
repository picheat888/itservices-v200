/**
 * "ประวัติโอนย้ายและรับคืน" — /reports/assets-transfer-history
 *
 * Report key assets.transfer_history. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function AssetsTransferHistoryReportPage() {
    return <TabularReportView reportKey="assets.transfer_history" />;
}
