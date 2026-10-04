/**
 * "ทรัพย์สินตามสถานะ และแผนก" — /reports/assets-by-status-department
 *
 * Report key assets.by_status_department. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function AssetsByStatusDepartmentReportPage() {
    return <TabularReportView reportKey="assets.by_status_department" />;
}
