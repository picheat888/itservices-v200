import type { StockMovementType } from '@/shared/types';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, RotateCcw } from 'lucide-react';

/** Visual tone shared by the movement feed/badges. */
export type MovementTone = 'green' | 'violet' | 'blue' | 'amber';

/** Icon + tone for each movement type (badges, detail dialog, dashboard feed). */
export const MV_META: Record<StockMovementType, { tone: MovementTone; icon: typeof ArrowDownToLine }> = {
    receive: { tone: 'green', icon: ArrowDownToLine },
    issue: { tone: 'violet', icon: ArrowUpFromLine },
    return: { tone: 'blue', icon: RotateCcw },
    transfer: { tone: 'amber', icon: ArrowLeftRight },
    adjust_up: { tone: 'green', icon: ArrowDownToLine },
    adjust_down: { tone: 'amber', icon: ArrowUpFromLine },
};

/** Tinted icon backgrounds for the movement feed, keyed by the MV_META tone. */
export const MV_TONE_BG: Record<MovementTone, string> = {
    green: 'bg-emerald-500/12 text-emerald-600',
    violet: 'bg-violet-500/12 text-violet-600',
    blue: 'bg-blue-500/12 text-blue-600',
    amber: 'bg-amber-500/12 text-amber-600',
};
