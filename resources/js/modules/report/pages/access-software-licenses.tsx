/**
 * "การใช้ License ซอฟต์แวร์" — /reports/access-software-licenses
 *
 * Report key access.software_licenses. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function AccessSoftwareLicensesReportPage() {
    return <TabularReportView reportKey="access.software_licenses" />;
}
