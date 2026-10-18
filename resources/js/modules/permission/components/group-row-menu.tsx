// Kebab menu of one Role Group row: open it, or delete it (not offered on a group the user may only view).
import { useT } from '@/lang';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Eye, MoreVertical, SquarePen, Trash2 } from 'lucide-react';
import type { GroupRole } from '../api/permissionApi';

export function GroupRowMenu({ group, locked, onOpen, onDelete }: { group: GroupRole; locked: boolean; onOpen: () => void; onDelete: () => void }) {
    const t = useT();
    return (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t('actions')} ${group.name}`}
                        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onOpen}>
                        {locked ? <Eye className="h-4 w-4" /> : <SquarePen className="h-4 w-4" />}
                        {locked ? t('view') : t('edit')}
                    </DropdownMenuItem>
                    {!locked && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                                <Trash2 className="h-4 w-4" />
                                {t('gr_delete')}
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
