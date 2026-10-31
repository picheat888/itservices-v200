// Member count in the members dialogs' subtitle: staff still working there, then "N left" in grey when anyone has left.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { countMembers, splitCounts } from '../lib/member-counts';
import { CountPlaceholder } from './count-placeholder';

export function MemberCount({
    members,
    loading,
    rowActive,
    rowTotal,
}: {
    members: { status?: string | null }[];
    loading: boolean;
    /** Counts from the clicked row, shown until the list arrives. */
    rowActive: number | undefined;
    rowTotal: number | undefined;
}) {
    const t = useT();
    const fmtN = useNumberFormat();
    const fromRow = rowActive != null && rowTotal != null ? splitCounts(rowActive, rowTotal) : null;
    const counts = loading ? fromRow : countMembers(members);

    return (
        <>
            <span>
                {counts ? (
                    t(counts.active === 1 ? 'members_n_one' : 'members_n').replace('{n}', fmtN(counts.active))
                ) : (
                    <>
                        <CountPlaceholder label={t('loading')} /> {t('dept_members')}
                    </>
                )}
            </span>
            {counts && counts.left > 0 && <span>{t('members_left_n').replace('{n}', fmtN(counts.left))}</span>}
        </>
    );
}
