/**
 * "อะไหล่ต่ำกว่าขั้นต่ำ" — /reports/stock-below-min
 *
 * Report key stock.below_min. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function StockBelowMinReportPage() {
    return <TabularReportView reportKey="stock.below_min" />;
}
