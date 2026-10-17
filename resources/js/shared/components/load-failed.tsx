// "Could not load" line with a retry button, for a list whose fetch failed (instead of an empty state).
import { useT } from '@/lang';
import { Button } from '@/shared/ui/button';
import { AlertCircle, RotateCcw } from 'lucide-react';

export function LoadFailed({ onRetry }: { onRetry: () => void }) {
    const t = useT();

    return (
        <span role="alert" className="text-destructive inline-flex flex-wrap items-center justify-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
            {t('load_failed')}
            <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t('retry')}
            </Button>
        </span>
    );
}

/** LoadFailed centred where an overview's cards would be, so a failed summary never reads as zeros. */
export function LoadFailedPanel({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="flex justify-center px-5 py-12">
            <LoadFailed onRetry={onRetry} />
        </div>
    );
}
