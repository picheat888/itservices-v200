import { findNavItem } from '@/app/nav';
import { useT } from '@/lang';
import { titleWithCount } from '@/shared/lib/document-title';
import { useUiStore } from '@/stores/ui';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Sets the browser tab title to "<Module> - <Brand Name>" based on the active route, with "(n) " for unread bells.
// brandName comes from the UI store (populated from DB settings), not from .env.
// Pass an explicit key for pages outside the nav (e.g. login); `detail` follows the label (a record's number).
export function useDocumentTitle(explicitKey?: string, detail?: string) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const brandName = useUiStore((s) => s.brandName);
    const pageMissing = useUiStore((s) => s.pageMissing);
    const unread = useUiStore((s) => s.titleUnread);
    const { pathname } = useLocation();

    useEffect(() => {
        const item = findNavItem(pathname);
        const labelKey = explicitKey ?? (pageMissing ? 'cmn_not_found_crumb' : (item?.label ?? 'overall'));
        const label = detail ? `${t(labelKey)} ${detail}` : t(labelKey);
        document.title = titleWithCount(`${label} - ${brandName}`, unread);
    }, [pathname, explicitKey, detail, pageMissing, lang, t, brandName, unread]);
}
