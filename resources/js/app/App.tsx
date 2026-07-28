import '../../css/app.css';

import { AppShell } from '@/app/layout/app-shell';
import { TransientToaster } from '@/app/layout/transient-toaster';
import PlaceholderPage from '@/app/placeholder';
import { AccessControlPage } from '@/modules/access';
import { AssetsPage, MyAssetsPage } from '@/modules/asset';
import { LoginPage, ProtectedRoute, RequirePermission } from '@/modules/auth';
import { ContractsPage } from '@/modules/contract';
import { DashboardPage } from '@/modules/dashboard';
import { EmailTemplatesPage } from '@/modules/email-templates';
import { EmployeesPage } from '@/modules/employee';
import { PermissionsPage } from '@/modules/permission';
import { SettingsPage, useHydrateSettings } from '@/modules/settings';
import { ItemHistoryPage, StockPage } from '@/modules/stock';
import { TicketsPage } from '@/modules/ticket';
import { AppErrorScreen } from '@/shared/components/app-error-screen';
import { useApplyTheme } from '@/shared/hooks/use-apply-theme';
import { queryClient } from '@/shared/lib/query-client';
import type { Role } from '@/shared/types';
import { ConfirmProvider } from '@/shared/ui/confirm-dialog';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

// Placeholder ("coming soon") modules and how their routes are gated. `requests`
// uses a permission key; `reports` is role-gated (matching the sidebar nav).
const modules: { path: string; titleKey: string; anyOf?: string[]; roles?: Role[] }[] = [
    { path: 'requests', titleKey: 'requests', anyOf: ['requests.submit', 'requests.view_all'] },
    { path: 'reports', titleKey: 'reports', roles: ['super', 'admin', 'hr'] },
];

function App() {
    useApplyTheme();
    useHydrateSettings();

    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
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
                                <RequirePermission anyOf={['employees.view']}>
                                    <EmployeesPage />
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
                                <RequirePermission anyOf={['tickets.create', 'tickets.view_all']}>
                                    <TicketsPage />
                                </RequirePermission>
                            }
                        />
                        <Route
                            path="assets"
                            element={
                                <RequirePermission anyOf={['assets.view']}>
                                    <AssetsPage />
                                </RequirePermission>
                            }
                        />
                        <Route
                            path="contracts"
                            element={
                                <RequirePermission anyOf={['contracts.view']}>
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
                            path="email-templates"
                            element={
                                <RequirePermission anyOf={['system.configure_notifications']}>
                                    <EmailTemplatesPage />
                                </RequirePermission>
                            }
                        />
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
            <TransientToaster />
        </ConfirmProvider>
    </QueryClientProvider>,
);
