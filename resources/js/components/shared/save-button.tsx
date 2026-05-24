import { Button, type ButtonProps } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { Check, Loader2 } from 'lucide-react';

interface SaveButtonProps extends ButtonProps {
    /** Spinner + "Saving…" while the request is in flight. */
    loading?: boolean;
    /** Animated check + "Saved" once it succeeds. */
    success?: boolean;
}

/**
 * Save button with three states: idle (label), loading (spinner), and success
 * (a checkmark that pops in). Used across the Settings tabs.
 */
export function SaveButton({ loading, success, disabled, children, ...props }: SaveButtonProps) {
    const t = useT();
    return (
        <Button disabled={loading || disabled} {...props}>
            {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
                <Check className="h-4 w-4 animate-in zoom-in-50 fade-in duration-300" />
            ) : null}
            {loading ? t('cred_saving') : success ? t('settings_saved') : children ?? t('save')}
        </Button>
    );
}
