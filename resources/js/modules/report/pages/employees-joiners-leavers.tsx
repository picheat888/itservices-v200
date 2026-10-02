/**
 * "พนักงานเข้าใหม่และลาออก" — /reports/employees-joiners-leavers
 *
 * Report key employees.joiners_leavers. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function EmployeesJoinersLeaversReportPage() {
    return <TabularReportView reportKey="employees.joiners_leavers" />;
}
