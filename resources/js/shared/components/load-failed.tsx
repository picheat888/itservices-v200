// "Could not load" line with a retry button, for a list whose fetch failed (instead of an empty state).
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { AlertCircle, RotateCw } from 'lucide-react';

/** `message` and `retryLabel` let a module say what failed in its own words; they default to the general "could not load" and "retry". */
type LoadFailedProps = { onRetry: () => void; message?: string; retryLabel?: string };

export function LoadFailed({ onRetry, message, retryLabel }: LoadFailedProps) {
    const t = useT();

    return (
        <span role="alert" className="text-destructive inline-flex flex-wrap items-center justify-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {message ?? t('load_failed')}
            <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCw className="h-3.5 w-3.5" />
                {retryLabel ?? t('retry')}
            </Button>
        </span>
    );
}

/** LoadFailed centred where an overview's cards would be, so a failed summary never reads as zeros. */
export function LoadFailedPanel(props: LoadFailedProps) {
    return (
        <div className="flex justify-center px-5 py-12">
            <LoadFailed {...props} />
        </div>
    );
}
