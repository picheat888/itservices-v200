/**
 * "ความเคลื่อนไหวรับเข้า-เบิกออก" — /reports/stock-movements
 *
 * Report key stock.movements. Its filters, columns and charts come from the backend definition
 * (one source for the screen, Excel, PDF and scheduled mail); anything particular to this
 * report goes here. Routed by ../routes.tsx.
 */
import { TabularReportView } from '../components/tabular-report-view';

export default function StockMovementsReportPage() {
    return <TabularReportView reportKey="stock.movements" />;
}
