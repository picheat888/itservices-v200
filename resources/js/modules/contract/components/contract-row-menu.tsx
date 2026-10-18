// Kebab menu of one contract row: view, edit and the lifecycle actions the detail dialog offers.
import { useT } from '@/lang';
import type { Contract } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Archive, Ban, Eye, MoreVertical, RotateCcw, SquarePen, Trash2 } from 'lucide-react';
import { isContractDeletable } from '../hooks/use-contract-actions';

export interface ContractRowPermissions {
    canEdit: boolean;
    canCancel: boolean;
    canExpire: boolean;
    canReactivate: boolean;
    canDelete: boolean;
}

export function ContractRowMenu({
    contract,
    can,
    onView,
    onEdit,
    onCancel,
    onExpire,
    onReactivate,
    onDelete,
}: {
    contract: Contract;
    can: ContractRowPermissions;
    onView: () => void;
    onEdit: () => void;
    onCancel: () => void;
    onExpire: () => void;
    onReactivate: () => void;
    onDelete: () => void;
}) {
    const t = useT();
    const terminal = contract.status === 'cancelled' || contract.status === 'expired';
    const showEdit = can.canEdit && !terminal;
    const showCancel = can.canCancel && contract.status === 'active';
    const showExpire = can.canExpire && contract.status === 'overdue';
    const showDelete = can.canDelete && isContractDeletable(contract);
    const showReactivate = can.canReactivate && terminal;
    const hasLifecycle = showCancel || showExpire || showDelete || showReactivate;
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
                    {showEdit && (
                        <DropdownMenuItem onClick={onEdit}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit')}
                        </DropdownMenuItem>
                    )}
                    {hasLifecycle && <DropdownMenuSeparator />}
                    {showReactivate && (
                        <DropdownMenuItem onClick={onReactivate}>
                            <RotateCcw className="h-4 w-4" />
                            {t('contract_reactivate')}
                        </DropdownMenuItem>
                    )}
                    {showExpire && (
                        <DropdownMenuItem onClick={onExpire}>
                            <Archive className="h-4 w-4" />
                            {t('contract_expire')}
                        </DropdownMenuItem>
                    )}
                    {showCancel && (
                        <DropdownMenuItem onClick={onCancel} className="text-destructive focus:text-destructive">
                            <Ban className="h-4 w-4" />
                            {t('contract_cancel')}
                        </DropdownMenuItem>
                    )}
                    {showDelete && (
                        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4" />
                            {t('contract_delete')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
