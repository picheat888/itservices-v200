import { useAuth } from '@/modules/auth/hooks/use-auth';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { Role } from '@/shared/types';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/** Seconds the NoAccess screen waits before redirecting to the dashboard. */
const REDIRECT_SECONDS = 15;

/**
 * Gates a route's content. The user passes when they are the super admin, hold at
 * least one of the `anyOf` permission keys, or have one of the `roles` (used by
 * role-gated modules such as Reports). Otherwise an inline NoAccess screen is shown
 * (the URL is left unchanged — no redirect).
 */
export function RequirePermission({ anyOf, roles, children }: { anyOf?: string[]; roles?: Role[]; children: React.ReactNode }) {
    const { user } = useAuth();
    const allowed =
        user?.role === 'super' ||
        (anyOf?.some((p) => user?.permissions?.includes(p)) ?? false) ||
        (!!user?.role && (roles?.includes(user.role) ?? false));

    if (allowed) {
        return <>{children}</>;
    }

    return <NoAccess />;
}

/**
 * Inline 403 screen — shown when RequirePermission gate fails inside the SPA.
 * Counts down and auto-redirects to the dashboard; the manual button leaves immediately.
 * The timer is cleared on unmount to avoid a stray redirect.
 */
export function NoAccess() {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const navigate = useNavigate();
    const [count, setCount] = useState(REDIRECT_SECONDS);

    useEffect(() => {
        if (count <= 0) {
            navigate('/');
            return;
        }
        const id = setTimeout(() => setCount((c) => c - 1), 1000);
        return () => clearTimeout(id);
    }, [count, navigate]);

    const pct = (count / REDIRECT_SECONDS) * 100;

    return (
        <div className="grid min-h-[72vh] place-items-center px-4">
            <div className="flex flex-col items-center gap-5 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                    <Lock className="h-8 w-8" />
                </span>

                <div className="space-y-1.5">
                    <h1 className="text-2xl font-bold tracking-tight">{t('noaccess_title')}</h1>
                    <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">{t('noaccess_desc')}</p>
                </div>

                <div className="w-full max-w-xs space-y-1.5">
                    <div className="text-muted-foreground flex items-center justify-between text-xs">
                        <span>{lang === 'th' ? 'กำลังกลับหน้า Dashboard' : 'Redirecting to dashboard'}</span>
                        <span className="tabular-nums">{count}s</span>
                    </div>
                    <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                        <div className="bg-brand h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
                    </div>
                </div>

                <Link
                    to="/"
                    className="text-brand mt-2 text-sm font-semibold no-underline transition-opacity hover:opacity-70"
                >
                    {t('noaccess_back')}
                </Link>
            </div>
        </div>
    );
}
