// Strip under a request's title when its current step has nobody who can approve it.
import { useT } from '@/lang';
import type { ServiceRequest } from '@/shared/types';
import { TriangleAlert } from 'lucide-react';
import { stuckLineKey, stuckStep } from '../lib/approval-block';

export function RequestStuckStrip({ request }: { request: ServiceRequest }) {
    const t = useT();
    const step = stuckStep(request);
    const lineKey = step ? stuckLineKey(step) : null;
    if (!step || !lineKey) return null;

    return (
        <div className="flex items-start gap-2.5 border-t border-l-2 border-l-amber-500 bg-amber-500/[0.06] px-6 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div className="min-w-0 text-sm">
                <div className="font-semibold text-amber-700 dark:text-amber-300">{t('req_stuck_title')}</div>
                <div className="text-muted-foreground text-xs">{t(lineKey).replaceAll('{step}', () => step.label)}</div>
            </div>
        </div>
    );
}
