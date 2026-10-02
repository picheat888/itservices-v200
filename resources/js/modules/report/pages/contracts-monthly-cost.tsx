/**
 * "ค่าใช้จ่ายสัญญารายเดือน" — /reports/contracts-monthly-cost
 *
 * Report key contracts.monthly_cost. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function ContractsMonthlyCostReportPage() {
    return <TabularReportView reportKey="contracts.monthly_cost" />;
}
