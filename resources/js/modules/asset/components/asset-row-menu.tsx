// Kebab menu of one inventory row: view, accept, mark received, transfer, edit.
import { useT } from '@/lang';
import type { Asset } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Check, CheckCircle2, Eye, MoreVertical, Share2, SquarePen } from 'lucide-react';

const GREEN_ITEM = 'text-emerald-700 focus:text-emerald-700 dark:text-emerald-400 dark:focus:text-emerald-400';

export function AssetRowMenu({
    asset,
    canAccept,
    canReceive,
    canTransfer,
    canEdit,
    onView,
    onAccept,
    onReceive,
    onTransfer,
    onEdit,
}: {
    asset: Asset;
    canAccept: boolean;
    canReceive: boolean;
    canTransfer: boolean;
    canEdit: boolean;
    onView: () => void;
    onAccept: () => void;
    onReceive: () => void;
    onTransfer: () => void;
    onEdit: () => void;
}) {
    const t = useT();
    return (
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`${t('asset_actions')} ${asset.asset_code}`}
                        className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <MoreVertical className="h-4 w-4" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onView}>
                        <Eye className="h-4 w-4" />
                        {t('asset_open_detail')}
                    </DropdownMenuItem>
                    {canAccept && (
                        <DropdownMenuItem onClick={onAccept} className={GREEN_ITEM}>
                            <Check className="h-4 w-4" />
                            {t('asset_accept')}
                        </DropdownMenuItem>
                    )}
                    {canReceive && (
                        <DropdownMenuItem onClick={onReceive} className={GREEN_ITEM}>
                            <CheckCircle2 className="h-4 w-4" />
                            {t('asset_mark_received')}
                        </DropdownMenuItem>
                    )}
                    {canTransfer && (
                        <DropdownMenuItem onClick={onTransfer}>
                            <Share2 className="h-4 w-4" />
                            {t('transfer_asset')}
                        </DropdownMenuItem>
                    )}
                    {canEdit && (
                        <DropdownMenuItem onClick={onEdit}>
                            <SquarePen className="h-4 w-4" />
                            {t('edit_asset')}
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
