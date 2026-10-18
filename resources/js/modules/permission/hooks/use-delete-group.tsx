// Delete a Role Group behind the danger confirm, saying where its members go (the table menu and the dialog footer share it).
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import type { GroupRole } from '../api/permissionApi';
import { permissionRefusalText } from '../lib/refusal';
import { useGroupRoleMutations, usePermissionMatrix } from './use-permissions';

/** Resolves true once the group is gone. */
export function useDeleteGroup(defaultGroup: GroupRole | null): (group: GroupRole) => Promise<boolean> {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const { remove } = useGroupRoleMutations();
    const { data: matrix } = usePermissionMatrix();
    const baseRole = matrix?.roles.find((r) => r.value === 'user')?.label ?? 'Staff';

    return (group) => {
        const lines = [
            group.member_count > 0 &&
                t('gr_delete_members')
                    .replace('{n}', fmtN(group.member_count))
                    .replace(
                        '{where}',
                        defaultGroup && defaultGroup.id !== group.id
                            ? t('gr_where_group').replace('{name}', defaultGroup.name)
                            : t('gr_where_none').replace('{role}', baseRole),
                    ),
            defaultGroup?.id === group.id && t('gr_delete_default'),
            t('cd_delete_desc'),
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
