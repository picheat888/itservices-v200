// The discard prompt's words, shared by the close guard (useDiscardGuard) and the Back / link guard (useNavigationGuard).
import type { ConfirmOptions } from '@/shared/ui/confirm-dialog';

/** `title` names what would be lost on a page that has its own word for it (the permissions page); the rest stays shared. */
export function discardConfirmOptions(t: (key: string) => string, title?: string): ConfirmOptions {
    return {
        variant: 'warn',
        title: title ?? t('discard_title'),
        description: t('discard_text'),
        confirmText: t('discard_confirm'),
        cancelText: t('discard_keep'),
    };
}
