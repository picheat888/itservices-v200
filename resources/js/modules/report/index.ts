// Report module public API: hub and report pages (loaded when opened), routes, and the card pieces the Dashboard reuses.
import { lazyPage } from '@/shared/lib/lazy-page';
export { heldStyle, useFoldRow } from './components/access-overview-cards';
export { CardEmpty, CardTitle, CODE_LINK, fold, FoldToggle, Sparkline, Swatch } from './components/chart-parts';
export { FILL } from './components/chart-tones';
export { KpiTile, slaLevel, type SlaLevel } from './components/kpi-tile';
export { reportSlug } from './components/report-catalogue';
export { ReportDateScope } from './components/report-date-scope';
export { TICKET_PRIORITY_TONE } from './components/ticket-badges';
export { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from './hooks/use-reports';
export { preloadReportPage, reportPageRoutes } from './routes';
export const ReportsPage = lazyPage(() => import('./pages'));
export const UnknownReportPage = lazyPage(() => import('./pages/unknown-report'));
