import { Button, type ButtonProps } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface SaveButtonProps extends ButtonProps {
    /** Spinner + "Saving…" while the request is in flight. */
    loading?: boolean;
    /** Animated check + "Saved" once it succeeds. */
    success?: boolean;
}

/** How long the success checkmark stays before reverting to the idle label. */
const SUCCESS_DURATION_MS = 2000;

/**
 * Save button with three states: idle (label), loading (spinner), and success
 * (a checkmark that pops in). The checkmark fires when the parent flags
 * `success` OR right after the spinner finishes (loading true → false), then
 * reverts to the idle label on its own. Used across the Settings tabs.
 */
export function SaveButton({ loading, success, disabled, children, ...props }: SaveButtonProps) {
    const t = useT();
    const [showSuccess, setShowSuccess] = useState(false);
    const wasLoading = useRef(false);

    useEffect(() => {
        // A save just finished when the spinner was on and has now turned off.
        const finishedLoading = wasLoading.current && !loading;
        wasLoading.current = !!loading;

        if (!success && !finishedLoading) {
            return;
        }

        setShowSuccess(true);
        const id = setTimeout(() => setShowSuccess(false), SUCCESS_DURATION_MS);
        return () => clearTimeout(id);
    }, [loading, success]);

    return (
        <Button disabled={loading || disabled} {...props}>
            {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : showSuccess ? (
                <Check className="animate-in zoom-in-50 fade-in h-4 w-4 duration-300" />
            ) : null}
            {loading ? t('cred_saving') : showSuccess ? t('settings_saved') : (children ?? t('save'))}
        </Button>
    );
}
