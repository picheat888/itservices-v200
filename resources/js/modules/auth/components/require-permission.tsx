import { useT } from '@/lang';
import { useAuth } from '@/modules/auth/hooks/use-auth';
import { EmptyState } from '@/shared/components/empty-state';
import type { Role } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Link } from 'react-router-dom';

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

/** Inline 403 screen for a failed RequirePermission gate; it stays until the reader leaves (WCAG 2.2.1). */
export function NoAccess({ title, hint }: { title?: string; hint?: string }) {
    const t = useT();

    return (
        <div className="grid min-h-[72dvh] place-items-center px-4">
            <EmptyState kind="denied" titleAs="h1" title={title ?? t('cmn_empty_no_access')} hint={hint ?? t('cmn_empty_no_access_hint')}>
                <Button asChild variant="outline">
                    <Link to="/">{t('noaccess_back')}</Link>
                </Button>
            </EmptyState>
        </div>
    );
}
