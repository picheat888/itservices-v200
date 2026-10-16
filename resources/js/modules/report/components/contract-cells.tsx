// Cells the three contract reports share: the code that opens the contract, the name with its vendor, the type pill.
import { useT } from '@/lang';
import { CONTRACT_TYPE_TONE } from '@/modules/contract';
import { StatusBadge } from '@/shared/components/status-badge';
import { useUiStore } from '@/stores/ui';
import { Link } from 'react-router-dom';
import { useCanOpen } from '../hooks/use-can-open';
import { CODE_LINK } from './chart-parts';
import { CONTRACT_TYPES, type ContractTypeKey } from './contract-tones';

/** A contract code that opens it on /contracts when the reader may. */
export function ContractCode({ id, code }: { id: number; code: string }) {
    const canOpen = useCanOpen();
    const href = `/contracts?view=${id}`;
    return canOpen(href) ? (
        <Link to={href} className={CODE_LINK} translate="no">
            {code}
        </Link>
    ) : (
        <span className="text-xs font-semibold" translate="no">
            {code}
        </span>
    );
}

/** The contract's name with its vendor under it; long ones wrap to a second line instead of hiding behind "…". */
export function ContractNameCell({ name, vendor }: { name: string | null; vendor: { name: string | null; name_th?: string | null } | null }) {
    const lang = useUiStore((s) => s.lang);
    const vendorName = vendor ? (lang === 'th' && vendor.name_th) || vendor.name : null;
    return (
        <div className="max-w-[18rem] min-w-[12rem] whitespace-normal">
            <div className="line-clamp-2 font-medium break-words">{name || '—'}</div>
            {vendorName && <div className="text-muted-foreground line-clamp-2 text-xs break-words">{vendorName}</div>}
        </div>
    );
}

/** The contract type as a pill in the /contracts colours. */
export function TypePill({ type }: { type: unknown }) {
    const t = useT();
    if (typeof type !== 'string' || !(CONTRACT_TYPES as string[]).includes(type)) return <span className="text-muted-foreground">—</span>;
    return <StatusBadge tone={CONTRACT_TYPE_TONE[type as ContractTypeKey]}>{t(`contract_type_${type}`)}</StatusBadge>;
}
