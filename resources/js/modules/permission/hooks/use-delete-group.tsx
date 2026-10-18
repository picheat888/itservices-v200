// Delete a Role Group behind the danger confirm, saying where its members go (the table menu and the dialog footer share it).
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import type { GroupRole } from '../api/permissionApi';
import { countKey, leaversWhere } from '../lib/group-rules';
import { permissionRefusalText } from '../lib/refusal';
import { useBaseRoleLabel, useGroupRoleMutations } from './use-permissions';

/** Resolves true once the group is gone. */
export function useDeleteGroup(defaultGroup: GroupRole | null): (group: GroupRole) => Promise<boolean> {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const { remove } = useGroupRoleMutations();
    const baseRole = useBaseRoleLabel();

    return (group) => {
        const where = leaversWhere(t, defaultGroup && defaultGroup.id !== group.id ? defaultGroup.name : null, baseRole);
        const lines = [
            group.member_count > 0 &&
                t(countKey('gr_delete_members', group.member_count)).replace('{n}', fmtN(group.member_count)).replace('{where}', where),
            defaultGroup?.id === group.id && t('gr_delete_default'),
            t('gr_delete_desc'),
        ].filter((line): line is string => !!line);

        return confirm({
            variant: 'danger',
            title: t('gr_delete_title').replace('{name}', group.name),
            description: (
                <>
                    {lines.map((line) => (
                        <span key={line} className="block">
                            {line}
                        </span>
                    ))}
                </>
            ),
            action: () => remove.mutateAsync(group.id),
            errorMessage: (err) => permissionRefusalText(err, t),
        });
    };
}
