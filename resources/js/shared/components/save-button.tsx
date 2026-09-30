import { useT } from '@/lang';
import { Button, type ButtonProps } from '@/shared/ui/button';
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
 * (a checkmark that pops in). The checkmark fires when the parent flags `success`
 * — and only then — and reverts to the idle label on its own. Used across the
 * Settings tabs.
 *
 * It used to also fire whenever the spinner stopped, which is just as true of a
 * save the server refused: the button said "Saved" over a failed save. A spinner
 * stopping says the request ended, not how.
 */
export function SaveButton({ loading, success, disabled, children, ...props }: SaveButtonProps) {
    const t = useT();
    const [showSuccess, setShowSuccess] = useState(false);
    const wasSuccess = useRef(false);

    useEffect(() => {
        // Fire on the rising edge only, so a flag left true doesn't re-show the check.
        const rose = !!success && !wasSuccess.current;
        wasSuccess.current = !!success;
        if (!rose) {
            return;
        }

        setShowSuccess(true);
        const id = setTimeout(() => setShowSuccess(false), SUCCESS_DURATION_MS);
        return () => clearTimeout(id);
    }, [success]);

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
