// The note of a stock movement: a count reason shows its words, a custom reason or an older movement shows the stored notes.
import type { useT } from '@/lang';
import type { CountReason } from '@/shared/types';

type Translate = ReturnType<typeof useT>;

export function movementNote(m: { reason?: CountReason | null; notes?: string | null }, t: Translate): string | null {
    if (m.reason && m.reason !== 'custom') {
        return t(`stock_count_reason_${m.reason}` as Parameters<Translate>[0]);
    }
    return m.notes ?? null;
}
