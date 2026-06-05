import { useAuth } from '@/hooks/use-auth';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
    const { isAuthenticated, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-brand" />
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
