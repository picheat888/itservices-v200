// Kebab menu of one contract row: view, and edit while the contract is still open.
import { useT } from '@/lang';
import type { Contract } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Eye, MoreVertical, SquarePen } from 'lucide-react';

export function ContractRowMenu({
    contract,
    canEdit,
    onView,
    onEdit,
}: {
    contract: Contract;
    canEdit: boolean;
    onView: () => void;
    onEdit: () => void;
}) {
    const t = useT();
    const editable = canEdit && contract.status !== 'cancelled' && contract.status !== 'expired';
    return (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t('actions')} ${contract.code}`}
                        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onView}>
                        <Eye className="h-4 w-4" />
                        {t('view')}
                    </DropdownMenuItem>
                    {editable && (
                        <DropdownMenuItem onClick={onEdit}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
