import type { StockMovementType } from '@/shared/types';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, RotateCcw } from 'lucide-react';

/** Visual tone shared by the movement feed/badges. */
export type MovementTone = 'green' | 'violet' | 'blue' | 'amber';

/** Icon, tone and qty sign (+1 inbound, −1 outbound, 0 transfer) for each movement type. */
export const MV_META: Record<StockMovementType, { tone: MovementTone; icon: typeof ArrowDownToLine; sign: 1 | -1 | 0 }> = {
    receive: { tone: 'green', icon: ArrowDownToLine, sign: 1 },
    issue: { tone: 'violet', icon: ArrowUpFromLine, sign: -1 },
    return: { tone: 'blue', icon: RotateCcw, sign: 1 },
    transfer: { tone: 'amber', icon: ArrowLeftRight, sign: 0 },
    adjust_up: { tone: 'green', icon: ArrowDownToLine, sign: 1 },
    adjust_down: { tone: 'amber', icon: ArrowUpFromLine, sign: -1 },
};

/** Tinted icon backgrounds for the movement feed, keyed by the MV_META tone. */
export const MV_TONE_BG: Record<MovementTone, string> = {
    green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
};

/** Finite attention blink for an alert icon (three pulses, off under reduced motion). */
export const ALERT_BLINK = 'motion-safe:animate-[pulse_1.4s_ease-in-out_3]';
