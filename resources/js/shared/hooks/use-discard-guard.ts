// Ask before a form with unsaved input closes (Esc, outside click, ×, Cancel); a clean form closes at once.
// Usage: const guardClose = useDiscardGuard(isDirty); onOpenChange={(o) => !o && guardClose(onClose)}
import { useT } from '@/lang';
import { useConfirm, type ConfirmOptions } from '@/shared/ui/confirm-dialog';
import { useCallback, useEffect } from 'react';

/** The discard prompt's words, shared with useNavigationGuard. */
export function discardConfirmOptions(t: (key: string) => string): ConfirmOptions {
    return {
        variant: 'warn',
        title: t('discard_title'),
        description: t('discard_text'),
        confirmText: t('discard_confirm'),
        cancelText: t('discard_keep'),
    };
}

export function useDiscardGuard(isDirty: boolean) {
    const confirm = useConfirm();
    const t = useT();

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
                const discard = await confirm(discardConfirmOptions(t));
                if (!discard) return;
            }
            close();
        },
        [isDirty, confirm, t],
    );
}
