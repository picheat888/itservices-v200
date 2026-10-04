/**
 * "การตัดจำหน่ายทรัพย์สิน" — /reports/assets-writeoffs
 *
 * Report key assets.writeoffs: the assets written off within a date range (assets.written_off_at).
 * Its filters, tiles, the by-month and by-category charts and the list come from the backend
 * definition (one source for the screen, Excel, PDF and scheduled mail). Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function AssetsWriteoffsReportPage() {
    return <TabularReportView reportKey="assets.writeoffs" />;
}
