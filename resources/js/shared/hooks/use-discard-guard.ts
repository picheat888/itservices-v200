// Ask before a form with unsaved input closes (Esc, outside click, ×, Cancel, Back, a link); a clean form closes at once.
// Usage: const guardClose = useDiscardGuard(isDirty); onOpenChange={(o) => !o && guardClose(onClose)}
import { useT } from '@/lang';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { discardConfirmOptions } from '@/shared/lib/discard-confirm';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { useCallback, useEffect } from 'react';

export { discardConfirmOptions };

/** The query params page modals live in; Back or a link that changes one asks first while a form is dirty. */
const MODAL_PARAMS = ['view', 'edit', 'add', 'count', 'dialog'] as const;

/**
 * `title` replaces the shared prompt title (discardConfirmOptions), for the close and the Back/link prompt alike.
 * `extraWatch` adds query params of the page itself (a tab, a picked row) that Back or a link must not change unasked.
 */
export function useDiscardGuard(isDirty: boolean, title?: string, extraWatch: readonly string[] = []) {
    const confirm = useConfirm();
    const t = useT();
    useNavigationGuard(isDirty, [...MODAL_PARAMS, ...extraWatch], title);

    // Reload / closing the tab with unsaved input gets the browser's own "leave site?" prompt.
    useEffect(() => {
        if (!isDirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [isDirty]);

    return useCallback(
        async (close: () => void) => {
            if (isDirty) {
                const discard = await confirm(discardConfirmOptions(t, title));
                if (!discard) return;
            }
            close();
        },
        [isDirty, confirm, t, title],
    );
}
