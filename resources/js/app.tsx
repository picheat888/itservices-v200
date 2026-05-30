import '../css/app.css';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { RequirePermission } from '@/components/auth/require-permission';
import { AppShell } from '@/components/shell/app-shell';
import { useApplyTheme } from '@/hooks/use-apply-theme';
import { useHydrateSettings } from '@/hooks/use-settings';
import AssetsPage from '@/pages/assets';
import ContractsPage from '@/pages/contracts';
import DashboardPage from '@/pages/dashboard';
import EmailTemplatesPage from '@/pages/email-templates';
import EmployeesPage from '@/pages/employees';
import LoginPage from '@/pages/login';
import PermissionsPage from '@/pages/permissions';
import PlaceholderPage from '@/pages/placeholder';
import SettingsPage from '@/pages/settings';
import StockPage from '@/pages/stock';
import TicketsPage from '@/pages/tickets';
import type { Role } from '@/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

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
                        <Route
                            path="employees"
                            element={
                                <RequirePermission anyOf={['employees.view']}>
                                    <EmployeesPage />
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
                                <RequirePermission anyOf={['stock.view']}>
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
                                <RequirePermission anyOf={['system.edit_settings']}>
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
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('app')!).render(
    <QueryClientProvider client={queryClient}>
        <App />
    </QueryClientProvider>,
);
