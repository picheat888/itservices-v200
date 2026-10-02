/**
 * "สัญญาใกล้หมดอายุ" — /reports/contracts-expiring
 *
 * Report key contracts.expiring. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function ContractsExpiringReportPage() {
    return <TabularReportView reportKey="contracts.expiring" />;
}
