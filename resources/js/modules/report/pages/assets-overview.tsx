/**
 * "ภาพรวมของทรัพย์สิน" — /reports/assets-overview
 *
 * Report key assets.overview (the asset register folded in). Its filters, tiles, cards and list
 * come from the backend definition (one source for the screen, Excel, PDF and scheduled mail);
 * the cards are drawn by components/tabular-charts.tsx. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function AssetsOverviewReportPage() {
    return <TabularReportView reportKey="assets.overview" />;
}
