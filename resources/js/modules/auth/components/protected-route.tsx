import { useT } from '@/lang';
import { useAuth } from '@/modules/auth/hooks/use-auth';
import { usePrefetchSidebarBadges } from '@/shared/hooks/use-sidebar-badges';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
    const t = useT();
    const { isAuthenticated, isLoading } = useAuth();
    usePrefetchSidebarBadges();
    const location = useLocation();

    if (isLoading) {
        return (
            <div role="status" className="flex h-dvh items-center justify-center">
                <div aria-hidden className="border-muted border-t-brand h-8 w-8 animate-spin rounded-full border-2" />
                <span className="sr-only">{t('loading')}</span>
            </div>
        );
    }

    if (!isAuthenticated) {
        // Remember where the reader was headed (e.g. an email link) so login can send them back there
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
}
