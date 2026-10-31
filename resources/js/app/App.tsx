import { AppShell } from '@/app/layout/app-shell';
import { Toaster } from '@/app/layout/toaster';
import NotFoundPage from '@/app/not-found';
import { AccessControlPage } from '@/modules/access';
import { AssetsPage } from '@/modules/asset';
import { LoginPage, ProtectedRoute, RequirePermission } from '@/modules/auth';
import { ContractsPage } from '@/modules/contract';
import { DashboardPage } from '@/modules/dashboard';
import { EmailTemplatesPage } from '@/modules/email-templates';
import { EmployeesPage } from '@/modules/employee';
import { useServiceWorkerBridge } from '@/modules/notification';
import { PermissionsPage } from '@/modules/permission';
import { ReportDateScope, reportPageRoutes, reportSlug, ReportsPage, UnknownReportPage } from '@/modules/report';
import { RequestsPage } from '@/modules/request';
import { SettingsPage, useHydrateSettings } from '@/modules/settings';
import { ItemHistoryPage, LotHistoryPage, StockPage } from '@/modules/stock';
import { TicketsPage } from '@/modules/ticket';
import { WorkflowsPage } from '@/modules/workflow';
import { AppErrorDialog } from '@/shared/components/app-error-dialog';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { PageLoading } from '@/shared/components/page-loading';
import { useApplyTheme } from '@/shared/hooks/use-apply-theme';
import { installClientErrorReporting } from '@/shared/lib/client-error-report';
import { queryClient } from '@/shared/lib/query-client';
import { ConfirmProvider } from '@/shared/ui/confirm-dialog';
import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

/** Send an old path to its new one, keeping the query string (<Navigate> alone drops it). */
function RedirectPreservingQuery({ to }: { to: string }) {
    const { search, hash } = useLocation();

    return <Navigate to={`${to}${search}${hash}`} replace />;
}

/** /reports/r/assets.warranty_expiring (the old report address) → /reports/assets-warranty-expiring, query kept. */
function OldReportRedirect() {
    const { key = '' } = useParams<{ key: string }>();

    return <RedirectPreservingQuery to={`/reports/${reportSlug(key)}`} />;
}

function App() {
    useApplyTheme();
    useHydrateSettings();
    // Registers /sw.js and keeps it in step with this page (bell wording, stacked push reset, push after sign-in)
    useServiceWorkerBridge();

    return (
        // No transitions: a tap moves the menu at once and the page loading fallback shows, instead of the old page lingering
        <BrowserRouter useTransitions={false}>
            {/* Pages outside the shell (stock item and lot history) wait here for their code */}
            <Suspense
                fallback={
                    <div className="bg-background mx-auto min-h-dvh max-w-5xl px-6 py-8">
                        <PageLoading />
                    </div>
                }
            >
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route element={<ProtectedRoute />}>
                        {/* Each gate accepts every key nav.ts shows the entry for (SidebarRouteGateTest) */}
                        <Route element={<AppShell />}>
                            <Route index element={<DashboardPage />} />
                            <Route
                                path="employees"
                                element={
                                    <RequirePermission anyOf={['employees.module', 'employees.view']}>
                                        <EmployeesPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="requests"
                                element={
                                    <RequirePermission anyOf={['requests.module']}>
                                        <RequestsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="workflows"
                                element={
                                    <RequirePermission anyOf={['workflows.module', 'workflows.manage']}>
                                        <WorkflowsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="access"
                                element={
                                    <RequirePermission anyOf={['access.module']}>
                                        <AccessControlPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="tickets"
                                element={
                                    <RequirePermission anyOf={['tickets.module', 'tickets.create', 'tickets.my', 'tickets.view_all']}>
                                        <TicketsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="assets"
                                element={
                                    <RequirePermission anyOf={['assets.module', 'assets.view']}>
                                        <AssetsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="contracts"
                                element={
                                    <RequirePermission anyOf={['contracts.module', 'contracts.view']}>
                                        <ContractsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="stock"
                                element={
                                    <RequirePermission anyOf={['stock.module']}>
                                        <StockPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="email-notifications"
                                element={
                                    <RequirePermission anyOf={['notifications.module']}>
                                        <EmailTemplatesPage />
                                    </RequirePermission>
                                }
                            />
                            {/* Old address, query string kept */}
                            <Route path="email-templates" element={<RedirectPreservingQuery to="/email-notifications" />} />
                            <Route
                                path="permissions"
                                element={
                                    <RequirePermission anyOf={['system.manage_permissions']}>
                                        <PermissionsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="settings"
                                element={
                                    <RequirePermission anyOf={['settings.access']}>
                                        <SettingsPage />
                                    </RequirePermission>
                                }
                            />
                            <Route
                                path="reports"
                                element={
                                    <RequirePermission anyOf={['reports.module']}>
                                        <ReportDateScope>
                                            <ReportsPage />
                                        </ReportDateScope>
                                    </RequirePermission>
                                }
                            />
                            {/* One route per report page, each with its own gate — modules/report/routes.tsx. */}
                            {reportPageRoutes.map(({ path, allOf, Page }) => (
                                <Route
                                    key={path}
                                    path={`reports/${path}`}
                                    element={
                                        <RequirePermission allOf={allOf}>
                                            <ReportDateScope>
                                                <Page />
                                            </ReportDateScope>
                                        </RequirePermission>
                                    }
                                />
                            ))}
                            {/* Old report addresses */}
                            <Route path="reports/tickets-by-department" element={<Navigate to="/reports/tickets-overview" replace />} />
                            <Route path="reports/tickets-staff-performance" element={<Navigate to="/reports/tickets-overview" replace />} />
                            <Route path="reports/r/:key" element={<OldReportRedirect />} />
                            <Route
                                path="reports/:slug"
                                element={
                                    <RequirePermission anyOf={['reports.module']}>
                                        <UnknownReportPage />
                                    </RequirePermission>
                                }
                            />
                            {/* An unknown address says so; a signed-out reader signs in first and lands back here */}
                            <Route path="*" element={<NotFoundPage />} />
                        </Route>
                        <Route
                            path="stock/items/:id/history"
                            element={
                                <RequirePermission anyOf={['stock.view']}>
                                    <ItemHistoryPage />
                                </RequirePermission>
                            }
                        />
                        <Route
                            path="stock/lots/:lotNo"
                            element={
                                <RequirePermission anyOf={['stock.view']}>
                                    <LotHistoryPage />
                                </RequirePermission>
                            }
                        />
                    </Route>
                </Routes>
            </Suspense>
        </BrowserRouter>
    );
}

installClientErrorReporting();

createRoot(document.getElementById('app')!).render(
    <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
            <AppErrorDialog />
            {/* The app's one toast region, shared by messages and notifications */}
            <Toaster />
        </ConfirmProvider>
    </QueryClientProvider>,
);
