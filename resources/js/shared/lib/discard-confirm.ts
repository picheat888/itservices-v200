// The discard prompt's words, shared by the close guard (useDiscardGuard) and the Back / link guard (useNavigationGuard).
import type { ConfirmOptions } from '@/shared/ui/confirm-dialog';

export function discardConfirmOptions(t: (key: string) => string): ConfirmOptions {
    return {
        variant: 'warn',
        title: t('discard_title'),
        description: t('discard_text'),
        confirmText: t('discard_confirm'),
        cancelText: t('discard_keep'),
    };
}
