import '../../css/app.css';

import { AppShell } from '@/app/layout/app-shell';
import { Toaster } from '@/app/layout/toaster';
import PlaceholderPage from '@/app/placeholder';
import { AccessControlPage } from '@/modules/access';
import { AssetsPage, MyAssetsPage } from '@/modules/asset';
import { LoginPage, ProtectedRoute, RequirePermission } from '@/modules/auth';
import { ContractsPage } from '@/modules/contract';
import { DashboardPage } from '@/modules/dashboard';
import { EmailTemplatesPage } from '@/modules/email-templates';
import { EmployeesPage } from '@/modules/employee';
import { PermissionsPage } from '@/modules/permission';
import { RequestsPage } from '@/modules/request';
import { SettingsPage, useHydrateSettings } from '@/modules/settings';
import { ItemHistoryPage, StockPage } from '@/modules/stock';
import { TicketsPage } from '@/modules/ticket';
import { WorkflowsPage } from '@/modules/workflow';
import { AppErrorScreen } from '@/shared/components/app-error-screen';
import { useApplyTheme } from '@/shared/hooks/use-apply-theme';
import { queryClient } from '@/shared/lib/query-client';
import { SUPER_ROLE, type Role } from '@/shared/types';
import { ConfirmProvider } from '@/shared/ui/confirm-dialog';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

// Placeholder ("coming soon") modules and how their routes are gated.
// `reports` is role-gated (matching the sidebar nav).
const modules: { path: string; titleKey: string; anyOf?: string[]; roles?: Role[] }[] = [
    { path: 'reports', titleKey: 'reports', roles: [SUPER_ROLE, 'admin', 'hr'] },
];

/**
 * Send an old path to its new one without losing what came after the `?`.
 *
 * <Navigate to="/x" /> drops the query string, which for a tabbed page means every
 * bookmark quietly lands on the wrong tab.
 */
function RedirectPreservingQuery({ to }: { to: string }) {
    const { search, hash } = useLocation();

    return <Navigate to={`${to}${search}${hash}`} replace />;
}

function App() {
    useApplyTheme();
    useHydrateSettings();

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                    {/* Every gate below must accept each key nav.ts shows the menu entry for —
                        a narrower route turns a visible icon into the 403 screen. Wider is fine:
                        the master key opens the page, the tabs inside gate themselves.
                        SidebarRouteGateTest holds the two lists together. */}
                    <Route element={<AppShell />}>
                        <Route index element={<DashboardPage />} />
                        {/* Employee self-service — gated by the My Assets permission (not assets.view). */}
                        <Route
                            path="my-assets"
                            element={
                                <RequirePermission anyOf={['assets.my']}>
                                    <MyAssetsPage />
                                </RequirePermission>
                            }
                        />
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
                                <RequirePermission anyOf={['requests.module', 'requests.submit', 'requests.view_all', 'requests.fulfill']}>
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
                                <RequirePermission anyOf={['system.configure_notifications']}>
                                    <EmailTemplatesPage />
                                </RequirePermission>
                            }
                        />
                        {/* The page was /email-templates until it grew a Notification tab and
                            stopped being only about templates. Bookmarks and anything already
                            sent round keep working, query string included — landing on the
                            Email tab when you asked for ?tab=notification would be its own bug. */}
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
                        {modules.map((m) => (
                            <Route
                                key={m.path}
                                path={m.path}
                                element={
                                    <RequirePermission anyOf={m.anyOf} roles={m.roles}>
                                        <PlaceholderPage titleKey={m.titleKey} />
                                    </RequirePermission>
                                }
                            />
                        ))}
                    </Route>
                    <Route
                        path="stock/items/:id/history"
                        element={
                            <RequirePermission anyOf={['stock.view']}>
                                <ItemHistoryPage />
                            </RequirePermission>
                        }
                    />
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('app')!).render(
    <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
            <App />
            <AppErrorScreen />
            {/* The app's one toast region — ad-hoc messages and server notifications
                share this queue, so they can never render over each other. */}
            <Toaster />
        </ConfirmProvider>
    </QueryClientProvider>,
);
