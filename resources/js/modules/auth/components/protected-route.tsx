import { useT } from '@/lang';
import { useAuth } from '@/modules/auth/hooks/use-auth';
import { usePrefetchSidebarBadges } from '@/shared/hooks/use-sidebar-badges';
import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
    const t = useT();
    const { isAuthenticated, isLoading } = useAuth();
    usePrefetchSidebarBadges();
    const location = useLocation();

    if (isLoading) {
        return (
            <div role="status" className="flex h-dvh items-center justify-center">
                <Loader2 aria-hidden className="text-brand h-8 w-8 animate-spin" />
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
