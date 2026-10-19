import { useT } from '@/lang';
import { useAuth } from '@/modules/auth/hooks/use-auth';
import { EmptyState } from '@/shared/components/empty-state';
import type { Role } from '@/shared/types';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

/** Seconds the NoAccess screen waits before redirecting to the dashboard. */
const REDIRECT_SECONDS = 15;

/**
 * Gates a route's content. The user passes when they are the super admin, hold at
 * least one of the `anyOf` permission keys, hold every `allOf` key (a report page, as
 * its server gate), or have one of the `roles`. Otherwise an inline NoAccess screen is
 * shown (the URL is left unchanged — no redirect).
 */
export function RequirePermission({
    anyOf,
    allOf,
    roles,
    children,
}: {
    anyOf?: string[];
    allOf?: string[];
    roles?: Role[];
    children: React.ReactNode;
}) {
    const { user, can } = useAuth();
    const allowed =
        (anyOf?.some((p) => can(p)) ?? false) ||
        (!!allOf && allOf.length > 0 && allOf.every((p) => can(p))) ||
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
export function NoAccess({ title, hint }: { title?: string; hint?: string }) {
    const t = useT();
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
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <div className="flex flex-col items-center gap-5 text-center">
                <EmptyState kind="denied" titleAs="h1" title={title ?? t('cmn_empty_no_access')} hint={hint ?? t('cmn_empty_no_access_hint')} />

                <div className="w-full max-w-xs space-y-1.5">
                    <div className="text-muted-foreground flex items-center justify-between text-xs">
                        <span>{t('auth_redirecting_to_dashboard')}</span>
                        <span className="tabular-nums">{count}s</span>
                    </div>
                    <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                        <div
                            className="bg-brand h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>

                <Link to="/" className="text-brand mt-2 text-sm font-semibold no-underline transition-opacity hover:opacity-70">
                    {t('noaccess_back')}
                </Link>
            </div>
        </div>
    );
}
