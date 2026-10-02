/**
 * "มูลค่าคงคลัง" — /reports/stock-valuation
 *
 * Report key stock.valuation. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function StockValuationReportPage() {
    return <TabularReportView reportKey="stock.valuation" />;
}
