import { useAuth } from '@/modules/auth/hooks/use-auth';
import { usePrefetchSidebarBadges } from '@/shared/hooks/use-sidebar-badges';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuth();
    // Loaded alongside the signed-in check, so pages draw with their badge counts known.
    const badgesSettled = usePrefetchSidebarBadges();
    const location = useLocation();

    if (isLoading || (isAuthenticated && !badgesSettled)) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="border-muted border-t-brand h-8 w-8 animate-spin rounded-full border-2" />
            </div>
        );
    }

    if (!isAuthenticated) {
        // Remember where the user was headed (e.g. an email Quick link) so login can
        // bounce them back there instead of always landing on the dashboard.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
}
