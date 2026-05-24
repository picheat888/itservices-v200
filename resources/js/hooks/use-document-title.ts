import { useT } from '@/lib/i18n';
import { navGroups } from '@/lib/nav';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Sets the browser tab title to "<Module> - <Brand Name>" based on the active route.
// brandName comes from the UI store (populated from DB settings), not from .env.
// Pass an explicit key for pages outside the nav (e.g. login).
export function useDocumentTitle(explicitKey?: string) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const brandName = useUiStore((s) => s.brandName);
    const { pathname } = useLocation();

    useEffect(() => {
        const item = navGroups.flatMap((g) => g.items).find((i) => i.to === pathname);
        const labelKey = explicitKey ?? item?.label ?? 'overall';
        document.title = `${t(labelKey)} - ${brandName}`;
    }, [pathname, explicitKey, lang, t, brandName]);
}
