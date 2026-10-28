// "มีของ" / "หมดแล้ว" badge of a Lot, on the shared StatusBadge.
import { useT } from '@/lang';
import { StatusBadge } from '@/shared/components/status-badge';
import type { LotState } from '@/shared/types';

export function LotStateBadge({ state, className }: { state: LotState; className?: string }) {
    const t = useT();
    return (
        <StatusBadge tone={state === 'empty' ? 'gray' : 'green'} className={className}>
            {state === 'empty' ? t('stock_lots_emptied') : t('stock_lots_in_stock')}
        </StatusBadge>
    );
}
