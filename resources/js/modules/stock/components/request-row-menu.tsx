// Kebab menu of one stock request row: open its detail, print its issue sheet, cancel the request.
import { useT } from '@/lang';
import type { StockRequest } from '@/shared/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { Ban, Eye, MoreVertical, Printer } from 'lucide-react';
import { useRef } from 'react';
import { issuePdfUrl } from '../api/stockApi';

// Clicks inside the menu (its portal bubbles through React) never open the row
const keepFromRow = (e: React.SyntheticEvent) => e.stopPropagation();

export function RequestRowMenu({
    request,
    requestNo,
    onOpen,
    onCancel,
}: {
    request: StockRequest;
    requestNo: string;
    /** `trigger` is the menu button, where focus returns once the detail closes. */
    onOpen: (r: StockRequest, trigger: HTMLElement | null) => void;
    onCancel: (r: StockRequest) => void;
}) {
    const t = useT();
    const triggerRef = useRef<HTMLButtonElement>(null);
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={keepFromRow}
                    aria-label={`${t('actions')} ${requestNo}`}
                    className="touch-hit hover:bg-accent focus-visible:ring-ring data-[state=open]:bg-accent relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
                >
                    <MoreVertical className="h-4 w-4" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48" onClick={keepFromRow}>
                <DropdownMenuItem onClick={() => onOpen(request, triggerRef.current)}>
                    <Eye className="h-4 w-4" />
                    {t('stock_rq_view_detail')}
                </DropdownMenuItem>
                {request.status === 'fulfilled' && request.issue_doc_no && (
                    <DropdownMenuItem asChild>
                        <a href={issuePdfUrl(request.id)} target="_blank" rel="noopener">
                            <Printer className="h-4 w-4" />
                            {t('stock_issue_print')}
                            <span className="sr-only">{t('stock_opens_new_tab')}</span>
                        </a>
                    </DropdownMenuItem>
                )}
                {request.can_cancel && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onCancel(request)} className="text-destructive focus:text-destructive">
                            <Ban className="h-4 w-4" />
                            {t('stock_cancel_request')}
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
