/**
 * Report module public API — the hub page and every report page with its address and gate
 * (routes.tsx, mounted by App.tsx), the not-found page for any other /reports/ address,
 * reportSlug (for App's redirect of old /reports/r/ links), and the exports-list query key the
 * shell refreshes on a bell, and the card pieces the Dashboard reuses.
 */
export { reportSlug } from './components/report-catalogue';
export { ReportDateScope } from './components/report-date-scope';
export { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from './hooks/use-reports';
export { default as ReportsPage } from './pages';
export { default as UnknownReportPage } from './pages/unknown-report';
export { reportPageRoutes } from './routes';
export { heldStyle, useFoldRow } from './components/access-overview-cards';
export { CardEmpty, CardTitle, CODE_LINK, fold, FoldToggle, Sparkline, Swatch } from './components/chart-parts';
export { FILL } from './components/chart-tones';
export { KpiTile } from './components/kpi-tile';
