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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } },
});

const modules: { path: string; titleKey: string }[] = [
    { path: 'requests', titleKey: 'requests' },
    { path: 'reports', titleKey: 'reports' },
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
                        <Route path="employees" element={<EmployeesPage />} />
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
                        <Route path="contracts" element={<ContractsPage />} />
                        <Route path="stock" element={<StockPage />} />
                        <Route path="email-templates" element={<EmailTemplatesPage />} />
                        <Route path="permissions" element={<PermissionsPage />} />
                        <Route path="settings" element={<SettingsPage />} />
                        {modules.map((m) => (
                            <Route key={m.path} path={m.path} element={<PlaceholderPage titleKey={m.titleKey} />} />
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
