import { useAuth } from '@/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Gates a route's content. The user passes when they are the super admin or hold
 * at least one of the `anyOf` permission keys; otherwise an inline NoAccess card
 * is shown (the URL is left unchanged — no redirect).
 */
export function RequirePermission({ anyOf, children }: { anyOf: string[]; children: React.ReactNode }) {
    const { user } = useAuth();
    const allowed = user?.role === 'super' || anyOf.some((p) => user?.permissions?.includes(p));

    if (allowed) {
        return <>{children}</>;
    }

    return <NoAccess />;
}

/** Friendly "you can't see this" panel rendered inside the app shell. */
function NoAccess() {
    const t = useT();
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <span className="bg-destructive/10 text-destructive flex h-14 w-14 items-center justify-center rounded-full">
                <ShieldAlert className="h-7 w-7" />
            </span>
            <h1 className="text-xl font-bold">{t('noaccess_title')}</h1>
            <p className="text-muted-foreground max-w-sm text-sm">{t('noaccess_desc')}</p>
            <Link to="/" className="bg-brand mt-2 rounded-md px-4 py-2 text-sm font-medium text-white">
                {t('noaccess_back')}
            </Link>
        </div>
    );
}
