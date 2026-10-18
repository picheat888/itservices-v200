// Header alert on the asset page: N assets their holders sent back, waiting for IT to receive them.
// Pressing it lists them in the inventory; pressing it again shows everything.
import { AlertButton } from '@/shared/components/alert-button';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { Undo2 } from 'lucide-react';

export function PendingReturnButton({
    count,
    active,
    onToggle,
    t,
}: {
    /** Assets awaiting receipt; undefined if the count could not be loaded. */
    count: number | undefined;
    /** The inventory list is currently filtered to these assets. */
    active: boolean;
    onToggle: () => void;
    t: (key: string) => string;
}) {
    const fmtN = useNumberFormat();
    if (!count) return null;

    return (
        <AlertButton tone="amber" icon={Undo2} pressed={active} onClick={onToggle}>
            {t('asset_pending_return_strip').replace('{count}', fmtN(count))}
        </AlertButton>
    );
}
