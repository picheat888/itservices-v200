/**
 * Whether the reader may open a module page a report links to (`/tickets?view=5`). Asks the
 * same menu gate the sidebar and the router use (nav.ts `anyOf`), so a report never links to
 * a page that would answer "no access" — a report can be open to someone through another
 * module's peek (leavers' assets under employees.view) without the assets module itself.
 */
import { findNavItem } from '@/app/nav';
import { useAuth } from '@/modules/auth';

export function useCanOpen(): (href: string) => boolean {
    const { can } = useAuth();

    return (href: string) => {
        const item = findNavItem(href.split('?')[0]);
        if (!item) return false;
        return !item.anyOf || item.anyOf.some((permission) => can(permission));
    };
}
