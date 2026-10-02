/**
 * "ทรัพย์สินค้างคืนจากผู้ลาออก" — /reports/employees-leaver-assets
 *
 * Report key employees.leaver_assets. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function EmployeesLeaverAssetsReportPage() {
    return <TabularReportView reportKey="employees.leaver_assets" />;
}
