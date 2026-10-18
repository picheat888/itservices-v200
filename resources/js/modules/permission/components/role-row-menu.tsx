// Kebab menu of one role template: edit name and colour, duplicate, delete.
// A system role (Administrator) offers only Duplicate.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Copy, MoreVertical, SquarePen, Trash2 } from 'lucide-react';
import type { RoleRow } from '../api/permissionApi';

// Below lg the menu sits in the tablet header, so items get a 40px touch height
const ITEM = 'max-lg:min-h-10';

export function RoleRowMenu({
    role,
    onEdit,
    onDuplicate,
    onDelete,
    className,
}: {
    role: RoleRow;
    onEdit: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    className?: string;
}) {
    const t = useT();
    return (
        <div onClick={(e) => e.stopPropagation()} className={cn('flex shrink-0', className)}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t('actions')} ${role.label}`}
                        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none max-lg:h-10 max-lg:w-10"
                    >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {!role.is_system && (
                        <DropdownMenuItem onClick={onEdit} className={ITEM}>
                            <SquarePen className="h-4 w-4" />
                            {t('perm_edit_name_color')}
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={onDuplicate} className={ITEM}>
                        <Copy className="h-4 w-4" />
                        {t('perm_duplicate')}
                    </DropdownMenuItem>
                    {!role.is_system && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onDelete} className={cn(ITEM, 'text-destructive focus:text-destructive')}>
                                <Trash2 className="h-4 w-4" />
                                {t('perm_delete_role')}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
