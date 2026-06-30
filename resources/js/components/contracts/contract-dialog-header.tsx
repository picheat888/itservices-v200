import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type LucideIcon } from 'lucide-react';

/**
 * Shared header for the contract View and Edit dialogs: a brand-tinted type-icon
 * tile, an uppercase eyebrow, the title with an optional mono code chip, and an
 * sr-only description for accessibility. Keeps both surfaces visually identical.
 */
export function ContractDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    code?: string;
    srDescription?: string;
}) {
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">{eyebrow}</div>
                <DialogTitle className="mt-0.5 flex items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{code}</span>
                    )}
                </DialogTitle>
            </div>
            <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        </div>
    );
}
