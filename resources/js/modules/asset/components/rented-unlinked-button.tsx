// Header alert on the asset page: N rented assets that still have no contract.
// Pressing it lists them in the inventory; pressing it again shows everything.
import { AlertButton } from '@/shared/components/alert-button';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { FileWarning } from 'lucide-react';

export function RentedUnlinkedButton({
    count,
    active,
    onToggle,
    t,
}: {
    /** Rented assets without a contract; undefined if the count could not be loaded. */
    count: number | undefined;
    /** The inventory list is currently filtered to these assets. */
    active: boolean;
    onToggle: () => void;
    t: (key: string) => string;
}) {
    const fmtN = useNumberFormat();
    if (!count) return null;

    return (
        <AlertButton tone="amber" icon={FileWarning} pressed={active} onClick={onToggle}>
            {t('asset_rented_unlinked_strip').replace('{count}', fmtN(count))}
        </AlertButton>
    );
}
