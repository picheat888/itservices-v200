// "ภาพรวมของทรัพย์สิน" report page (/reports/assets-overview): filters, tiles, cards and list all come from the
// backend definition (assets.overview); the cards are drawn by components/tabular-charts.tsx.
import { TabularReportView } from '../components/tabular-report-view';

export default function AssetsOverviewReportPage() {
    return <TabularReportView reportKey="assets.overview" extras={{ rowsTitle: 'rep_ov_rows_title' }} />;
}
