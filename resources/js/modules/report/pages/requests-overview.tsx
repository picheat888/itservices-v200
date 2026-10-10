/**
 * "ภาพรวมคำขอ" — /reports/requests-overview (report key requests.overview).
 * Generic table view for now; the cards above the list come with the page build.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function RequestsOverviewReportPage() {
    return <TabularReportView reportKey="requests.overview" />;
}
