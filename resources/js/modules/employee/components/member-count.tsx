// Member count in the members dialogs' subtitle: staff still working there, then "N left" in grey when anyone has left.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { countMembers } from '../lib/member-counts';
import { CountPlaceholder } from './count-placeholder';

export function MemberCount({
    members,
    loading,
    rowActive,
    rowTotal,
    label,
}: {
    members: { status?: string | null }[];
    loading: boolean;
    /** Counts from the clicked row, shown until the list arrives. */
    rowActive: number | undefined;
    rowTotal: number | undefined;
    label: string;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fromRow = rowActive != null && rowTotal != null ? { active: rowActive, left: Math.max(0, rowTotal - rowActive) } : null;
    const counts = loading ? fromRow : countMembers(members);

    return (
        <>
            <span>
                {counts ? fmtN(counts.active) : <CountPlaceholder label={t('loading')} />} {label}
            </span>
            {counts && counts.left > 0 && <span>{t('members_left_n').replace('{n}', fmtN(counts.left))}</span>}
        </>
    );
}
