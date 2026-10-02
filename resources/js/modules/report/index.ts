/**
 * Report module public API — the hub page and every report page with its address and gate
 * (routes.tsx, mounted by App.tsx), the not-found page for any other /reports/ address,
 * reportSlug (for App's redirect of old /reports/r/ links), and the exports-list query key the
 * shell refreshes on a bell.
 */
export { reportSlug } from './components/report-catalogue';
export { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from './hooks/use-reports';
export { default as ReportsPage } from './pages';
export { default as UnknownReportPage } from './pages/unknown-report';
export { reportPageRoutes } from './routes';
