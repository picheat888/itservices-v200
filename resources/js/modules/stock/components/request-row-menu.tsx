// Kebab menu of one stock request row: cancel the request.
import { useT } from '@/lang';
import type { StockRequest } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Ban, MoreVertical } from 'lucide-react';

export function RequestRowMenu({ request, requestNo, onCancel }: { request: StockRequest; requestNo: string; onCancel: (r: StockRequest) => void }) {
    const t = useT();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`${t('actions')} ${requestNo}`}
                    className="hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
                >
                    <MoreVertical className="h-4 w-4" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onCancel(request)} className="text-destructive focus:text-destructive">
                    <Ban className="h-4 w-4" />
                    {t('stock_cancel_request')}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
