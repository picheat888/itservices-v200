/** Report module public API — pages mounted by App.tsx (and reportSlug, for its redirect of old /reports/r/ links), and the exports-list query key the shell refreshes on a bell. */
export { reportSlug } from './components/report-catalogue';
export { REPORT_EXPORTS_KEY, REPORT_SCHEDULES_KEY } from './hooks/use-reports';
export { default as ReportsPage } from './pages';
export { default as TabularReportPage } from './pages/tabular-report';
export { default as TicketOverviewReportPage } from './pages/ticket-overview';
